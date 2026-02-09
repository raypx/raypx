import { generateText } from "ai";

import { AICache } from "../cache";
import { createAnthropic } from "../providers/anthropic";
import { createOpenAI } from "../providers/openai";
import type { AIProvider, AnalysisOptions, AnalysisResult } from "../types";
import { AI_MODELS } from "../types";

export class AnalysisService {
  private cache: AICache;
  private openaiApiKey?: string;
  private anthropicApiKey?: string;

  constructor(cache: AICache, openaiApiKey?: string, anthropicApiKey?: string) {
    this.cache = cache;
    this.openaiApiKey = openaiApiKey;
    this.anthropicApiKey = anthropicApiKey;
  }

  private getProviderModel(provider: AIProvider, model: string) {
    if (provider === "openai") {
      const providerClient = createOpenAI(this.openaiApiKey);
      return providerClient.model(model);
    }
    const providerClient = createAnthropic(this.anthropicApiKey);
    return providerClient.model(model);
  }

  async analyze(
    data: unknown,
    dataType: string,
    analysisType: string,
    options: AnalysisOptions = {},
  ): Promise<AnalysisResult> {
    const model = options.model ?? "gpt-4o";
    const modelConfig = AI_MODELS[model];

    if (!modelConfig) {
      throw new Error(`Unknown model: ${model}`);
    }

    // Prepare data for analysis
    const dataStr = JSON.stringify(data, null, 2);

    // Check cache
    const cacheKey = this.cache.generateAnalysisCacheKey(
      modelConfig.provider,
      model,
      dataType,
      dataStr,
      analysisType,
    );

    const cached = await this.cache.getCachedResponse(cacheKey);
    if (cached) {
      return JSON.parse(cached.content);
    }

    // Get provider model
    const providerModel = this.getProviderModel(modelConfig.provider, model);

    // Build analysis prompt based on type
    const prompt = this.buildAnalysisPrompt(data, dataType, analysisType);

    // Call AI
    const result = await generateText({
      model: providerModel,
      prompt,
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens ?? 4096,
    } as Parameters<typeof generateText>[0]);

    // Parse AI response
    const analysisResult: AnalysisResult = {
      summary: result.text,
      insights: [],
      metadata: {
        dataType,
        analysisType,
      },
    };

    // Cache response
    await this.cache.setCachedResponse(cacheKey, {
      content: JSON.stringify(analysisResult),
      timestamp: Date.now(),
    });

    return analysisResult;
  }

  private buildAnalysisPrompt(data: unknown, dataType: string, analysisType: string): string {
    const dataStr = JSON.stringify(data, null, 2);

    const prompts: Record<string, string> = {
      trend: `Analyze the following ${dataType} data for trends:\n\n${dataStr}\n\nProvide a summary of the trends you identify and key insights.`,
      summary: `Summarize the following ${dataType} data:\n\n${dataStr}\n\nProvide a comprehensive summary and key takeaways.`,
      prediction: `Based on the following ${dataType} data, make predictions:\n\n${dataStr}\n\nProvide predictions based on patterns you identify.`,
      anomaly: `Analyze the following ${dataType} data for anomalies:\n\n${dataStr}\n\nIdentify any anomalies, outliers, or unusual patterns.`,
    };

    return prompts[analysisType] ?? prompts.summary ?? "";
  }
}

export const analysisService = new AnalysisService(
  new AICache({} as any), // Will be initialized with proper cache
  process.env.OPENAI_API_KEY,
  process.env.ANTHROPIC_API_KEY,
);
