// 积分定价配置 — 从 .env 读取，运营可调整

export const pricing = {
  textInputPerMillion: parseFloat(process.env.PRICING_TEXT_INPUT_PER_MILLION || '0.6'),
  textOutputPerMillion: parseFloat(process.env.PRICING_TEXT_OUTPUT_PER_MILLION || '3.6'),
  imagePerSheet: parseFloat(process.env.PRICING_IMAGE_PER_SHEET || '0.05'),
  markup: parseFloat(process.env.PRICING_MARKUP || '0.05'),
  creditsPerYuan: parseInt(process.env.PRICING_CREDITS_PER_YUAN || '1000', 10),
}

export function calculateCredits(usage: {
  promptTokens: number
  completionTokens: number
  imageCount: number
}): number {
  const textCost =
    (usage.promptTokens * pricing.textInputPerMillion) / 1_000_000 +
    (usage.completionTokens * pricing.textOutputPerMillion) / 1_000_000
  const imageCost = usage.imageCount * pricing.imagePerSheet
  const totalCost = (textCost + imageCost) * (1 + pricing.markup)
  const credits = Math.ceil(totalCost * pricing.creditsPerYuan)
  return Math.max(credits, 1) // 最少扣 1 积分
}

// 预估检查：粗略估算一次生成的积分上限
export function estimateMaxCredits(pageCount: number, hasImages: boolean): number {
  // 假设每页 ~500 输入 + ~1000 输出 tokens
  const estimatedPromptTokens = pageCount * 500
  const estimatedCompletionTokens = pageCount * 1000
  const imageCount = hasImages ? pageCount : 0
  return calculateCredits({
    promptTokens: estimatedPromptTokens,
    completionTokens: estimatedCompletionTokens,
    imageCount,
  })
}
