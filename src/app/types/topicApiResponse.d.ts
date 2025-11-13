export type TopicApiResponse = {
  topic: {
    id: string;
    title: string;
    description?: string;
    createdBy?: { _id: string; name?: string };
    tags?: string[];
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
  };
  arguments: Array<{
    id: string;
    side?: "for" | "against" | "neutral" | string;
    body: string;
    createdBy?: { _id: string; name?: string };
    createdAt?: string;
    upvoteCount?: number;
    downvoteCount?: number;
    score?: number;
    commentCount?: number;
    comments: Array<{
      id: string;
      body: string;
      createdBy?: { _id: string; name?: string };
      createdAt?: string;
      upvoteCount?: number;
      downvoteCount?: number;
      score?: number;
    }>;
    aiAnalysis?: {
      isFact: boolean;
      isOpinion: boolean;
      justification: string;
    };
  }>;
  facts?: Array<{
    id: string;
    text: string;
    sourceArgument: string; // argument id fact was derived from
    createdAt?: string;
  }>;
  meta: { ordering: "relevant" | "newest"; returnedArguments: number; requestedArguments: number };
};