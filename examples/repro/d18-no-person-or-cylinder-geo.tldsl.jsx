import { Doc, Box } from "tldsl";

// C4 mandates two shapes this tool has no value for. Change either geo below
// to the shape the convention asks for and check rejects it:
//   geo="person"   -> error[ir/invalid-style-value]: 'geo' must be one of
//                     arrow-down, ..., x-box (got 'person')
//   geo="cylinder" -> the same list (got 'cylinder')
// Both are drawn as ellipses here, which is the closest stand-in and reads as
// neither an actor nor a datastore.

export default function NoPersonOrCylinderGeo() {
  return (
    <Doc layout="row" gap="96">
      <Box id="customer" label={"Personal Banking Customer\n[Person]"} maxW="240" geo="ellipse" color="blue" />
      <Box id="database" label={"Database\n[Container: Oracle]"} maxW="240" geo="ellipse" color="green" />
    </Doc>
  );
}
