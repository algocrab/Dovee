export {};

declare global {
  interface Window {
    doveeDesktop?: {
      isDesktop: true;
      platform: NodeJS.Platform;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  }
}
