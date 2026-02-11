import dotenv from "dotenv";
dotenv.config();
import { routeResponsesClient } from "../../services/aiRoutingService";
import { genderOptions, hairColorOptions, ethnicityOptions } from "../../services/openaiImageGenerationService";
import fs from "node:fs/promises";
import path from "node:path";
import { generate as generatePassword } from "generate-password";
import config from "./config.json";
import { Buffer } from "node:buffer";
import { v4 as uuidv4 } from 'uuid';

type GeneratedUserProfile = {
    username: string;
    age: number;
    name: string;
    gender: typeof genderOptions[number];
    hairColor: typeof hairColorOptions[number];
    ethnicitySkin: typeof ethnicityOptions[number];
    bio: string;
};

type SimulatedUser = GeneratedUserProfile & {
    email: string;
    password: string;
    registered: boolean;
    registerStatus?: number;
    registerError?: string;
    loginStatus?: number;
    loginError?: string;
    avatar?: {
        avatarUrl?: string;
        avatarThumbUrl?: string;
        avatarOriginalUrl?: string;
        avatarOriginalThumbUrl?: string;
    };
    avatarSet?: boolean;
    avatarError?: string;
    bioSet?: boolean;
    bioError?: string;
};

function buildEmailFromBase(username: string): string {
    const [local, domain] = config.baseEmailAddress.split("@");
    if (!local || !domain) {
        throw new Error(`baseEmailAddress must be a valid email, got "${config.baseEmailAddress}"`);
    }
    return `${local}+${username}-${uuidv4()}@${domain}`;
}

function parseFunctionCallArguments<T>(rawArgs: unknown): T {
    if (typeof rawArgs === "string") {
        return JSON.parse(rawArgs) as T;
    }
    if (rawArgs && typeof rawArgs === "object") {
        return rawArgs as T;
    }
    throw new Error("Tool call arguments were empty or invalid");
}

function ensureUniqueUsername(base: string, existing: Set<string>): string {
    const normalized = base.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
    let candidate = normalized || `user${Math.floor(Math.random() * 100000)}`;
    let attempt = 0;
    while (existing.has(candidate)) {
        attempt += 1;
        const suffix = String(attempt).padStart(2, "0");
        candidate = `${normalized}${suffix}`.slice(0, 12);
    }
    existing.add(candidate);
    return candidate;
}

// ────────────────────────── Diversity Steering ──────────────────────────
// Cultural-region pool used to nudge each generated user toward a different
// background.  The pool is shuffled once per simulation run and regions are
// assigned round-robin so every batch gets maximum spread.

const CULTURAL_REGIONS = [
    "Japanese", "Korean", "Chinese", "Vietnamese", "Thai",
    "Indian (Hindi-speaking)", "Indian (Tamil-speaking)", "Pakistani", "Bangladeshi", "Sri Lankan",
    "Nigerian", "Kenyan", "Ethiopian", "South African", "Ghanaian", "Senegalese",
    "Mexican", "Colombian", "Brazilian", "Argentine", "Peruvian", "Chilean",
    "German", "French", "Italian", "Polish", "Dutch", "Swedish", "Greek", "Irish", "Scottish",
    "Russian", "Ukrainian", "Turkish", "Iranian", "Egyptian", "Lebanese",
    "Filipino", "Indonesian", "Malaysian",
    "Australian", "Canadian (Quebecois)", "Jamaican", "Trinidadian",
    "Native American", "Maori (New Zealand)", "Aboriginal Australian",
    "Arab (Gulf region)", "Israeli", "Kurdish",
    "African-American", "British (English)", "American (Southern US)", "American (Midwest)",
];

function shuffleArray<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

const shuffledRegions = shuffleArray(CULTURAL_REGIONS);
let regionIndex = 0;

function nextRegion(): string {
    const region = shuffledRegions[regionIndex % shuffledRegions.length];
    regionIndex++;
    return region;
}

// Track generated demographics to give the AI explicit "avoid" instructions
const generatedNames: string[] = [];
const generatedGenders: string[] = [];

function buildDiversityContext(): string {
    const parts: string[] = [];
    if (generatedNames.length > 0) {
        parts.push(`Names already used (DO NOT repeat or use similar names): ${generatedNames.join(", ")}`);
    }
    const genderCounts: Record<string, number> = {};
    for (const g of generatedGenders) {
        genderCounts[g] = (genderCounts[g] || 0) + 1;
    }
    const most = Object.entries(genderCounts).sort((a, b) => b[1] - a[1])[0];
    if (most && most[1] >= 2) {
        const others = genderOptions.filter((g: string) => g !== most[0]);
        parts.push(`Gender balance: "${most[0]}" has been generated ${most[1]} time(s) already — strongly prefer one of: ${others.join(", ")}`);
    }
    return parts.join("\n");
}

async function generateUser(existingUsernames: Set<string>): Promise<GeneratedUserProfile> {
    const region = nextRegion();
    const diversityContext = buildDiversityContext();
    const prompt = [
        `Generate a simulated user profile for a web application.`,
        `This user should have a name and background typical of someone from a ${region} cultural background.`,
        `Use an authentic first name common in that culture — DO NOT default to generic Western names like Maria, John, etc.`,
        `Vary age widely (18-85). Mix genders evenly across the simulation.`,
        diversityContext,
    ].filter(Boolean).join("\n");

    const routed = await routeResponsesClient({
        text: prompt,
        openAiModel: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.2",
        grokModel: process.env.GROK_RESPONSES_MODEL,
    });
    if (!routed) {
        throw new Error("OpenAI client not configured");
    }
    const response = await routed.client.responses.create({
        input: [
            {
                role: "system",
                content: [
                    "You are a helpful assistant that generates realistic but fictional user profiles for testing purposes.",
                    "CRITICAL: Each profile must be unique and culturally diverse.",
                    "Use authentic names from the specified cultural background — not anglicised or generic versions.",
                    "Vary age, gender, hair color, and ethnicity. Never repeat a name or produce near-duplicates.",
                ].join(" "),
            },
            {
                role: "user",
                content: prompt,
            }
        ],
        tools: [
            {
                type: "function",
                name: "generate_user_profile",
                description: "Generates a realistic but fictional user profile for testing purposes.",
                parameters: {
                    type: "object",
                    properties: {
                        username: {
                            type: "string",
                            description: "A unique username for the user, 8-12 characters, lowercase letters and numbers only.",
                        },
                        age: {
                            type: "integer",
                            description: "Age of the user, between 18 and 85.",
                        },
                        name: {
                            type: "string",
                            description: "Full name of the user.",
                        },
                        gender: {
                            type: "string",
                            description: `Gender of the user, one of: ${genderOptions.join(", ")}.`,
                            enum: genderOptions,
                        },
                        hairColor: {
                            type: "string",
                            description: `Hair color of the user, one of: ${hairColorOptions.join(", ")}.`,
                            enum: hairColorOptions,
                        },
                        ethnicitySkin: {
                            type: "string",
                            description: `Ethnicity/skin tone of the user, one of: ${ethnicityOptions.join(", ")}.`,
                            enum: ethnicityOptions,
                        },
                        bio: {
                            type: "string",
                            description: "A short bio for the user, 1-2 sentences. Should be written in first person from the perspective of the user.",
                        },
                    },
                    required: ["username", "age", "name", "gender", "hairColor", "ethnicitySkin", "bio"],
                    additionalProperties: false,
                },
                strict: true,
            },
        ],
        model: routed.model,
        safety_identifier: "user-simulation",
        ...(routed.provider === "grok" ? {} : { reasoning: { effort: "low" } }),
        store: true,
    });

    for (const item of response.output || []) {
        if (item.type === "function_call" && item.name === "generate_user_profile") {
            const parsed = parseFunctionCallArguments<GeneratedUserProfile>(item.arguments);
            const username = ensureUniqueUsername(parsed.username, existingUsernames);
            // Track for diversity steering
            generatedNames.push(parsed.name);
            generatedGenders.push(parsed.gender);
            return { ...parsed, username };
        }
    }
    throw new Error("No user profile returned by model.");
}

async function registerUserUsingApi(userProfile: GeneratedUserProfile, email: string, password: string): Promise<{ ok: boolean; status: number; error?: string }> {
    const registerResponse = await fetch(`${config.appUrl}/api/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            email,
            password,
            name: userProfile.name,
        }),
    });
    if (!registerResponse.ok) {
        return { ok: false, status: registerResponse.status, error: await registerResponse.text() };
    }
    return { ok: true, status: registerResponse.status };
}

type AuthTokenResult = { ok: boolean; status: number; token?: string; error?: string };

async function loginForToken(email: string, password: string): Promise<AuthTokenResult> {
    const response = await fetch(`${config.appUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data?.token !== "string") {
        return { ok: false, status: response.status, error: data?.message || data?.error || "Login failed" };
    }
    return { ok: true, status: response.status, token: data.token };
}

function buildAuthHeaders(token: string, extra?: HeadersInit): HeadersInit {
    return {
        ...(extra || {}),
        Authorization: `Bearer ${token}`,
    };
}

async function generateAvatarBase64(userProfile: GeneratedUserProfile, token: string): Promise<string> {
    const response = await fetch(`${config.appUrl}/api/profile/avatar/generate`, {
        method: "POST",
        headers: buildAuthHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({
            gender: userProfile.gender,
            age: userProfile.age,
            hairColor: userProfile.hairColor,
            ethnicitySkin: userProfile.ethnicitySkin,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to generate avatar: ${await response.text()}`);
    }
    const data = await response.json().catch(() => ({}));
    if (!data?.base64 || typeof data.base64 !== "string") {
        throw new Error("Avatar generation did not return base64 data.");
    }
    return data.base64;
}

type UploadResponse = {
    url?: string;
    storageUrl?: string;
    previewUrl?: string;
    originalUrl?: string;
    originalPreviewUrl?: string;
    blurred?: boolean;
    blurReasons?: string[];
};

async function uploadAvatarImage(base64: string, token: string, filename: string): Promise<UploadResponse> {
    const buffer = Buffer.from(base64, "base64");
    const blob = new Blob([buffer], { type: "image/png" });
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("purpose", "avatar");

    const response = await fetch(`${config.appUrl}/api/uploads`, {
        method: "POST",
        headers: buildAuthHeaders(token),
        body: form,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error || "Failed to upload avatar image.");
    }
    return data as UploadResponse;
}

async function updateUserProfile(payload: Record<string, any>, token: string): Promise<{ ok: boolean; status: number; error?: string }> {
    const response = await fetch(`${config.appUrl}/api/user/update`, {
        method: "POST",
        headers: buildAuthHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        return { ok: false, status: response.status, error: await response.text() };
    }
    return { ok: true, status: response.status };
}

async function processUser(
    index: number,
    total: number,
    existingUsernames: Set<string>,
): Promise<SimulatedUser> {
    const label = `[User ${index + 1}/${total}]`;
    console.log(`\n${label} Generating profile...`);
    const profile = await generateUser(existingUsernames);
    console.log(`${label} Generated: ${profile.name} (${profile.gender}, ${profile.ethnicitySkin}) → @${profile.username}`);
    const email = buildEmailFromBase(profile.username);
    const password = generatePassword({
        length: 16,
        numbers: true,
        symbols: true,
        uppercase: true,
        lowercase: true,
    });
    console.log(`${label} Registering ${email}...`);
    const registerResult = await registerUserUsingApi(profile, email, password);
    let loginStatus: number | undefined;
    let loginError: string | undefined;
    let avatarSet = false;
    let avatarError: string | undefined;
    let bioSet = false;
    let bioError: string | undefined;
    let avatarData: SimulatedUser["avatar"];

    if (registerResult.ok) {
        console.log(`${label} Registration successful.`);
        console.log(`${label} Requesting bearer token...`);
        const loginResult = await loginForToken(email, password);
        loginStatus = loginResult.status;
        loginError = loginResult.error;
        const token = loginResult.token;

        if (loginResult.ok && token) {
            console.log(`${label} Token acquired. Generating avatar...`);
            try {
                const base64 = await generateAvatarBase64(profile, token);
                const filename = `generated-avatar-${Date.now()}-${profile.username}.png`;
                const upload = await uploadAvatarImage(base64, token, filename);
                avatarData = {
                    avatarUrl: upload.storageUrl || upload.url,
                    avatarThumbUrl: upload.previewUrl,
                    avatarOriginalUrl: upload.originalUrl,
                    avatarOriginalThumbUrl: upload.originalPreviewUrl,
                };
                if (!avatarData.avatarUrl) {
                    throw new Error("Avatar upload did not return a storage URL.");
                }

                console.log(`${label} Avatar uploaded. Updating profile avatar...`);
                const avatarUpdate = await updateUserProfile({
                    avatarUrl: avatarData.avatarUrl,
                    avatarThumbUrl: avatarData.avatarThumbUrl,
                    avatarOriginalUrl: avatarData.avatarOriginalUrl,
                    avatarOriginalThumbUrl: avatarData.avatarOriginalThumbUrl,
                    avatarModeration: null,
                }, token);
                avatarSet = avatarUpdate.ok;
                avatarError = avatarUpdate.error;
            } catch (err) {
                avatarError = err instanceof Error ? err.message : String(err);
                console.log(`${label} Avatar error: ${avatarError}`);
            }

            console.log(`${label} Updating bio...`);
            const bioUpdate = await updateUserProfile({ bio: profile.bio }, token);
            bioSet = bioUpdate.ok;
            bioError = bioUpdate.error;
            console.log(`${label} Bio update ${bioSet ? "succeeded" : "failed"}.`);
        } else {
            console.log(`${label} Login failed: ${loginError || "Unknown error"}`);
        }
    } else {
        console.log(`${label} Registration failed: ${registerResult.error || registerResult.status}`);
    }

    console.log(`${label} Finished.`);

    return {
        ...profile,
        email,
        password,
        registered: registerResult.ok,
        registerStatus: registerResult.status,
        registerError: registerResult.error,
        loginStatus,
        loginError,
        avatar: avatarData,
        avatarSet,
        avatarError,
        bioSet,
        bioError,
    };
}

async function runSimulation(): Promise<SimulatedUser[]> {
    const usedUsernames = new Set<string>();
    const concurrency = config.concurrency ?? 5;
    const total = config.numUsers;

    console.log(`Starting simulation: ${total} users with concurrency ${concurrency}`);

    const results: SimulatedUser[] = [];

    for (let batch = 0; batch < total; batch += concurrency) {
        const batchSize = Math.min(concurrency, total - batch);
        const indices = Array.from({ length: batchSize }, (_, i) => batch + i);

        console.log(`\n--- Processing batch ${Math.floor(batch / concurrency) + 1} (users ${batch + 1}-${batch + batchSize}) ---`);

        const batchResults = await Promise.all(
            indices.map((index) => processUser(index, total, usedUsernames))
        );

        results.push(...batchResults);
    }

    return results;
}

async function main() {
    const users = await runSimulation();
    const outputFile = path.resolve(process.cwd(), `simulation_${Date.now()}.json`);
    await fs.writeFile(outputFile, JSON.stringify({ users }, null, 2), "utf-8");
    console.log(`Wrote ${users.length} users to ${outputFile}`);
}

main().catch((err) => {
    console.error("User simulation failed:", err);
    process.exitCode = 1;
});

export type UserSimulationResult = {
    summary: string;
    suggestedImprovements: string;
};
