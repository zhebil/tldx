import { Doc, Box } from "tldsl";

// A C4 element is a name, a bracketed type, and a description on three lines.
// Both boxes below pass check with no diagnostic; only one of them is a label.
// The left one is written as a JSX string attribute, so the \n never becomes an
// escape - it renders as the two characters backslash-n inside the box. The
// right one is the expression form and wraps onto three lines as intended.
// The skill documents neither form.

export default function LiteralNewlineInLabel() {
  return (
    <Doc layout="row" gap="96">
      <Box id="attr" maxW="240" label="Web Application\n[Container: Java, Spring MVC]\nDelivers the SPA." />
      <Box id="expr" maxW="240" label={"Web Application\n[Container: Java, Spring MVC]\nDelivers the SPA."} />
    </Doc>
  );
}
