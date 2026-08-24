// The viewer is bundled by Vite, which resolves CSS side-effect imports.
// tsc has no such resolver, so it needs the module shape spelled out.
declare module "*.css";
