import { Doc } from "tldsl";
import { OpsxLifecycle } from "./diagrams/opsx.jsx";
import { ContextWindow } from "./diagrams/context-window.jsx";
import { WhenToCompact } from "./diagrams/compact.jsx";
import { Phase1, Phase2 } from "./diagrams/collab-phases.jsx";
import { CollabBoard } from "./diagrams/collab-board.jsx";
import { AppLifecycle } from "./diagrams/app-lifecycle.jsx";

export default function Diagram() {
  return (
    <Doc layout="col" gap="160" pad="80">
      <OpsxLifecycle />
      <ContextWindow />
      <WhenToCompact />
      <AppLifecycle />
      <Phase1 />
      <Phase2 />
      <CollabBoard />
    </Doc>
  );
}
