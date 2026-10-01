/// <reference types="vite/client" />

declare module 'virtual:image-sizes' {
  const sizes: Record<string, { w: number; h: number }>
  export default sizes
}
