import { v4 as uuidv4 } from 'uuid';
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Gender = "male" | "female";

type EthnicitySkin =
  | "East Asian (light to medium skin tone)"
  | "South Asian (medium to deep skin tone)"
  | "Black (deep skin tone)"
  | "White (light skin tone)"
  | "Middle Eastern (medium skin tone)"
  | "Latino (light to medium skin tone)"
  | "Southeast Asian (medium skin tone)"
  | "North African (medium to deep skin tone)";

type HairColor =
  | "black"
  | "dark brown"
  | "brown"
  | "light brown"
  | "blonde"
  | "red"
  | "auburn"
  | "grey"
  | "white";

export type ProfilePromptArgs = {
  gender: Gender;                // male | female
  age: number;                   
  hairColor: HairColor;
  ethnicitySkin: EthnicitySkin;  // combined ethnicity + skin tone
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Builds a prompt for generating a generic photorealistic profile picture.
 * Designed to produce varied faces across calls while staying realistic.
 */
export function buildPhotorealisticProfilePrompt({
  gender,
  age,
  hairColor,
  ethnicitySkin
}: ProfilePromptArgs): string {
  const safeAge = clamp(Math.round(age), 18, 85);

  // Randomised but realistic options
  const faceShapes = ["oval", "round", "square", "heart", "diamond"] as const;
  const hairLengths = ["very short", "short", "medium length", "shoulder-length"] as const;
  const hairTextures = ["straight", "wavy", "curly", "coily"] as const;
  const eyeColors = ["brown", "hazel", "green", "blue", "grey"] as const;

  const expressions = ["neutral expression", "subtle warm smile", "relaxed neutral expression"] as const;
  const clothing = [
    "plain t-shirt in a neutral color",
    "casual button-up shirt in a neutral color",
    "simple sweater in a neutral color",
    "hoodie in a neutral color",
  ] as const;

  // “Dominant feature” rotation reduces same-face syndrome
  const dominantFeature = pick([
    "subtle natural facial asymmetry typical of real humans",
    "slightly uneven smile lines",
    "a mild under-eye crease",
    "a slightly crooked nose bridge",
    "a softly defined jawline",
    "gentle freckles (very subtle)",
    "subtle skin texture and pores visible",
  ] as const);

  // Background/lighting variability but still “profile pic safe”
  const backdrops = [
    "plain softly blurred studio background in neutral tones",
    "softly blurred indoor background with neutral colors",
    "simple gradient backdrop, subtle and neutral",
  ] as const;

  const lighting = pick([
    "soft natural window light with realistic shadows",
    "diffused studio lighting, natural and flattering",
    "soft overcast daylight look, realistic shadow falloff",
  ] as const);

  const prompt = [
    `Photorealistic head-and-shoulders portrait of a ${gender}.`,
    `Age: ${safeAge}.`,
    `Ethnicity & skin tone: ${ethnicitySkin}.`,
    `Hair: ${hairColor}, ${pick(hairTextures)} texture, ${pick(hairLengths)}.`,
    `Face shape: ${pick(faceShapes)}.`,
    `Eyes: ${pick(eyeColors)}.`,
    `${pick(expressions)}, looking directly at the camera.`,
    `Well-groomed, non-distinctive, average facial features (not model-like).`,
    `${dominantFeature}.`,
    `Clothing: ${pick(clothing)}.`,
    `Background: ${pick(backdrops)}.`,
    `Lighting: ${lighting}.`,
    `Camera style: professional DSLR portrait, 85mm lens, f/1.8, shallow depth of field.`,
    `Ultra-realistic, natural colors, realistic skin texture, high detail.`,
    `Framing: head-and-shoulders portrait with visible headroom, subject slightly lower in frame, some empty space above the head.`,
    `Randomization token: ${uuidv4()}.`,
  ].join(" ");


  return prompt;
}

export async function generateProfileImage(promptArgs: ProfilePromptArgs): Promise<string> {
    const prompt = buildPhotorealisticProfilePrompt(promptArgs);
    const response = await openai.images.generate({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
    });
    return response?.data?.[0]?.b64_json || "";
}