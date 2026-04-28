import type { TextProviderInfo, ImageProviderInfo } from './types'
import type { TextProvider, ImageProvider } from './provider'

class ProviderRegistry {
  private textProviders = new Map<string, TextProvider>()
  private imageProviders = new Map<string, ImageProvider>()

  registerText(provider: TextProvider) {
    this.textProviders.set(provider.id, provider)
  }

  registerImage(provider: ImageProvider) {
    this.imageProviders.set(provider.id, provider)
  }

  getTextProvider(id: string): TextProvider | undefined {
    return this.textProviders.get(id)
  }

  getImageProvider(id: string): ImageProvider | undefined {
    return this.imageProviders.get(id)
  }

  listTextProviders(): TextProviderInfo[] {
    return Array.from(this.textProviders.values()).map((p) => p.getInfo())
  }

  listImageProviders(): ImageProviderInfo[] {
    return Array.from(this.imageProviders.values()).map((p) => p.getInfo())
  }
}

export const registry = new ProviderRegistry()
