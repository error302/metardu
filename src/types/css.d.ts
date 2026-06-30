// Allow CSS imports without type errors
declare module '*.css' {
  const content: { [className: string]: string }
  export default content
}
