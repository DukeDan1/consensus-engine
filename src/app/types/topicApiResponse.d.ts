type UserSummary = {
  _id?: string;
  name?: string;
  nickname?: string;
  avatarUrl?: string | null;
  avatarThumbUrl?: string | null;
  createdAt?: string | null;
};

export type TopicApiResponse = {
  topic: {
    id: string;
    title: string;
    description?: string;
    createdBy?: UserSummary;
    subscription?: {
      isSubscribed: boolean;
    };
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
    createdBy?: UserSummary;
    createdAt?: string;
    subscription?: {
      isSubscribed: boolean;
    };
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
    evidence?: Array<{
      url: string;
      kind?: 'link' | 'file';
      fileName?: string;
      contentType?: string;
      label?: string;
      previewUrl?: string;
      originalUrl?: string;
      originalPreviewUrl?: string;
      blurred?: boolean;
      blurReasons?: string[];
    }>;
    visibility?: {
      status?: 'visible' | 'hidden' | 'needs_review' | 'blocked';
      reason?: string;
      categories?: string[];
      spamLikelihood?: number;
      trollingLikelihood?: number;
      offTopicLikelihood?: number;
      illegalOrHarmfulLikelihood?: number;
      quality?: number;
      model?: string;
    };
    isRemoved?: boolean;
    comments: Array<{
      id: string;
      body: string;
      createdBy?: UserSummary;
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
      evidence?: Array<{
        url: string;
        kind?: 'link' | 'file';
        fileName?: string;
        contentType?: string;
        label?: string;
        previewUrl?: string;
        originalUrl?: string;
        originalPreviewUrl?: string;
        blurred?: boolean;
        blurReasons?: string[];
      }>;
      visibility?: {
        status?: 'visible' | 'hidden' | 'needs_review' | 'blocked';
        reason?: string;
        categories?: string[];
        spamLikelihood?: number;
        trollingLikelihood?: number;
        offTopicLikelihood?: number;
        illegalOrHarmfulLikelihood?: number;
        quality?: number;
        model?: string;
      };
      isRemoved?: boolean;
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
