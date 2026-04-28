import type {
  TextProviderInfo,
  ImageProviderInfo,
  TextBreakdownRequest,
  TextBreakdownResult,
  ImageGenerationRequest,
  ImageGenerationResult,
} from './types'

export interface TextProvider {
  readonly id: string
  getInfo(): TextProviderInfo
  generateBreakdown(req: TextBreakdownRequest): Promise<TextBreakdownResult>
}

export interface ImageProvider {
  readonly id: string
  getInfo(): ImageProviderInfo
  generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult>
}
