import { Frame, Group, Box, Edge, Note, flow } from "tldsl";

export const ContextWindow = () => (
  <Frame id="ctx" name="Context window" layout="col" gap="90" pad="40">
    <Frame id="ctx1" name="1. New chat  -  5 / 15 / 80" layout="row" gap="0" pad="16">
      <Box id="c1-sys" color="violet" fill="solid" dash="solid" w="40" h="44" />
      <Box id="c1-smart" color="green" fill="solid" dash="solid" w="120" h="44" />
      <Box id="c1-free" color="grey" fill="none" dash="dashed" w="640" h="44" />
    </Frame>

    <Frame id="ctx2" name="2. Bloated context  -  5 / 35 / 60" layout="row" gap="0" pad="16">
      <Box id="c2-sys" color="violet" fill="solid" dash="solid" w="40" h="44" />
      <Box id="c2-smart" color="green" fill="solid" dash="solid" w="280" h="44" />
      <Box id="c2-dumb" color="light-red" fill="solid" dash="solid" w="480" h="44" />
    </Frame>

    <Frame id="ctx3" name="3. After /compact  -  5 / 10 / 20 / 65" layout="row" gap="0" pad="16">
      <Box id="c3-sys" color="violet" fill="solid" dash="solid" w="40" h="44" />
      <Box id="c3-prev" color="orange" fill="solid" dash="solid" w="80" h="44" />
      <Box id="c3-smart" color="green" fill="solid" dash="solid" w="160" h="44" />
      <Box id="c3-free" color="grey" fill="none" dash="dashed" w="520" h="44" />
    </Frame>

    <Group id="legend" layout="row" gap="20">
      <Box id="lg-sys" label={"system prompt\npinned, always read"} color="violet" fill="solid" size="s" maxW="220" />
      <Box id="lg-smart" label={"smart zone\nrecent turns + head"} color="green" fill="solid" size="s" maxW="220" />
      <Box id="lg-dumb" label={"dumb zone\nthe lost middle, unread"} color="light-red" fill="solid" size="s" maxW="220" />
      <Box id="lg-prev" label={"prev context\nthe /compact summary"} color="orange" fill="solid" size="s" maxW="220" />
      <Box id="lg-free" label={"free\nunused"} color="grey" fill="none" dash="dashed" size="s" maxW="220" />
    </Group>
<Edge from="c2-dumb" to="c3-prev" label="/compact" color="orange" />
  </Frame>
);
