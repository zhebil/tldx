/**
 * A small C4-ish vocabulary, written entirely as components over the tier-1
 * `Box`/`Frame` primitives exported by `"tldsl"`. This module is deliberately
 * *outside* the library (T16b): it is the composability test proving a
 * domain vocabulary can be built in userland without any change to
 * `src/runtime/`.
 */
import { Box, Frame } from "tldsl";

export function Person({ id, name, description }) {
  const label = description ? `${name} - ${description}` : name;
  return <Box id={id} label={label} geo="ellipse" color="violet" fill="semi" />;
}

export function System({ id, name, description, external }) {
  const label = description
    ? `${name}${external ? " (external)" : ""} - ${description}`
    : name;
  return (
    <Box id={id} label={label} geo="rectangle" color={external ? "grey" : "blue"} fill="semi" />
  );
}

export function Container({ id, name, technology }) {
  const label = technology ? `${name} [${technology}]` : name;
  return <Box id={id} label={label} geo="rectangle" color="light-blue" fill="semi" />;
}

export function Boundary({ id, name, layout, children }) {
  return (
    <Frame id={id} name={name} layout={layout ?? "row"} gap="40" pad="20" color="grey">
      {children}
    </Frame>
  );
}
