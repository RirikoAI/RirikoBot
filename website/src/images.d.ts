/** Docusaurus (webpack) turns an imported image into its hashed URL. */
declare module '*.webp' {
  const url: string;
  export default url;
}
