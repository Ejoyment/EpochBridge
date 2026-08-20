declare module 'graphql-depth-limit' {
  import { ValidationContext, ASTVisitor } from 'graphql';
  function depthLimit(
    maxDepth: number,
    options?: { ignore?: string[] }
  ): (context: ValidationContext) => ASTVisitor;
  export default depthLimit;
}
