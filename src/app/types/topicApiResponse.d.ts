export type TopicApiResponse = {
  topic: {
    id: string;
    title: string;
    description?: string;
    createdBy?: { _id: string; name?: string };
    ontologyCategories?: Array<{
      id: string;
      label: string;
      description?: string;
      confidence?: number;
      similarity?: number;
    }>;
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
    ontologyCategories?: Array<{
      id: string;
      label: string;
      description?: string;
      confidence?: number;
      similarity?: number;
    }>;
    comments: Array<{
      id: string;
      body: string;
      createdBy?: { _id: string; name?: string };
      createdAt?: string;
      upvoteCount?: number;
      downvoteCount?: number;
      score?: number;
      ontologyCategories?: Array<{
        id: string;
        label: string;
        description?: string;
        confidence?: number;
        similarity?: number;
      }>;
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