import { Frame, Group, Box, Edge, flow } from "tldsl";

export const AppLifecycle = () => (
  <Frame id="fc" name="Application startup and main loop" layout="col" gap="80" pad="56" align="center">
    <Box id="fc-start" label="Start" geo="oval" color="grey" />
    <Box id="fc-auth" label={"User\nAuthentication"} />
    <Box id="fc-quit" label="Quit?" geo="diamond" color="orange" />
    <Box id="fc-passed" label={"Authentication\npassed?"} geo="diamond" color="orange" />

    <Group id="fc-init" layout="row" gap="100">
      <Box id="fc-manager" label={"Start Manager\nModule"} color="blue" />
      <Box id="fc-data" label={"Initialize data,\ngenerate GUI"} color="blue" />
      <Box id="fc-other" label={"Initialize other\nmodules"} color="blue" />
    </Group>

    <Group id="fc-comm" layout="row" gap="140">
      <Box id="fc-thread" label={"Start Communication\nthread"} color="blue" />
      <Box id="fc-invoke" label={"Invoke Communication\nModule in multi-thread"} color="light-blue" />
    </Group>

    <Box id="fc-timer" label={"Start Algorithm\nExecution Timer"} color="blue" />

    <Group id="fc-loop" layout="row" gap="130" align="center">
      <Box id="fc-event" label={"Start Event\nLoop"} color="green" />
      <Group id="fc-branches" layout="col" gap="90">
        <Group id="fc-timeup" layout="row" gap="100">
          <Box id="fc-time" label="Time up?" geo="diamond" color="orange" w="133" h="109" />
          <Box id="fc-exec" label={"Execute\nalgorithm"} color="violet" />
        </Group>
        <Group id="fc-anyop" layout="row" gap="100">
          <Box id="fc-op" label={"Any\noperation?"} geo="diamond" color="orange" w="215" h="183" />
          <Box id="fc-respond" label={"Response to\noperation"} color="violet" />
        </Group>
      </Group>
      <Box id="fc-update" label="Update data" color="violet" />
    </Group>

    <Box id="fc-endq" label="End Program?" geo="diamond" color="orange" w="285" h="218" />
    <Box id="fc-end" label="End" geo="oval" color="grey" />

    {flow("fc-start", "fc-auth", "fc-quit")}
    <Edge from="fc-quit" to="fc-passed" label="No" />
    <Edge from="fc-quit" to="fc-end" label="Yes" color="red" />
    <Edge from="fc-passed" to="fc-auth" label="No" color="red" dash="dashed" />
    <Edge from="fc-passed" to="fc-manager" label="Yes" color="green" />

    {flow("fc-manager", "fc-data", "fc-other", "fc-thread")}
    <Edge from="fc-thread" to="fc-invoke" color="light-blue" />
    <Edge from="fc-thread" to="fc-timer" />
    <Edge from="fc-timer" to="fc-event" />

    <Edge from="fc-event" to="fc-time" />
    <Edge from="fc-event" to="fc-op" />
    <Edge from="fc-time" to="fc-time" label="No" color="grey" dash="dashed" />
    <Edge from="fc-op" to="fc-op" label="No" color="grey" dash="dashed" />
    <Edge from="fc-time" to="fc-exec" label="Yes" color="green" />
    <Edge from="fc-op" to="fc-respond" label="Yes" color="green" />
    <Edge from="fc-exec" to="fc-update" />
    <Edge from="fc-respond" to="fc-update" />

    <Edge from="fc-update" to="fc-endq" />
    <Edge from="fc-endq" to="fc-event" label="No" color="grey" />
    <Edge from="fc-endq" to="fc-end" label="Yes" color="red" />
  </Frame>
);
