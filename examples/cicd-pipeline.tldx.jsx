import { Doc, Frame, Box, Edge, Sticky, flow } from "tldx";

// A CI/CD pipeline for a containerised service: commit through build, tests,
// a manual approval gate, staging, smoke tests and production - with the two
// paths that make a pipeline a pipeline rather than a list. A failed quality
// gate goes back to the author, and a failed production health check rolls
// forward to the previous image tag by re-running the deploy stage.

export default function CicdPipeline() {
  return (
    <Doc layout="col" gap="96">
      <Frame id="ci" name="Continuous integration" layout="row" gap="64">
        <Box id="commit" maxW="200" label={"Commit\ngit push to feature branch"} color="blue" />
        <Box id="build" maxW="200" label={"Build\ndocker build, push to registry"} />
        <Box id="unit" maxW="200" label={"Unit tests\n2,400 tests, ~4 min"} />
        <Box id="integration" maxW="200" label={"Integration tests\nephemeral namespace, ~11 min"} />
        <Box
          id="quality-gate"
          maxW="200"
          geo="diamond"
          color="yellow"
          label={"Quality gate\ncoverage >= 80%\nno high CVEs"}
        />
      </Frame>

      <Box
        id="approval"
        maxW="220"
        geo="diamond"
        color="orange"
        label={"Manual approval\nrelease manager signs off"}
      />

      <Frame id="cd" name="Continuous delivery" layout="row" gap="64">
        <Box id="deploy-staging" maxW="200" label={"Deploy to staging\nhelm upgrade, 1 replica"} color="light-blue" />
        <Box id="smoke-staging" maxW="200" label={"Staging smoke tests\n18 journeys, ~2 min"} color="light-blue" />
        <Box id="deploy-prod" maxW="200" label={"Deploy to production\ncanary 10%, then 100%"} color="light-green" />
        <Box id="smoke-prod" maxW="200" label={"Production smoke tests\n6 read-only journeys"} color="light-green" />
        <Box
          id="health-gate"
          maxW="200"
          geo="diamond"
          color="yellow"
          label={"Health gate\nerror rate < 1% for 10 min"}
        />
      </Frame>

      <Frame id="offramps" name="Off-ramps" layout="row" gap="96">
        <Box id="notify" maxW="200" label={"Notify author\nSlack #ci-failures"} color="red" />
        <Box id="rollback" maxW="200" label={"Rollback\nre-deploy previous image tag"} color="red" dash="dashed" />
        <Box id="released" maxW="200" label={"Released\ntag promoted to stable"} geo="ellipse" color="green" />
      </Frame>

      {flow("commit", "build", "unit", "integration", "quality-gate")}
      {flow("deploy-staging", "smoke-staging", "deploy-prod", "smoke-prod", "health-gate")}

      <Edge from="quality-gate" to="approval" label="pass" font="sans" size="s" color="green" />
      <Edge from="quality-gate" to="notify" label="fail" font="sans" size="s" color="red" />
      <Edge from="approval" to="deploy-staging" label="approved" font="sans" size="s" color="green" />
      <Edge from="approval" to="notify" label="rejected" font="sans" size="s" color="red" />
      <Edge from="smoke-staging" to="notify" label="smoke failed" font="sans" size="s" color="red" />
      <Edge from="notify" to="commit" label="fix and re-push" font="sans" size="s" dash="dashed" />
      <Edge from="health-gate" to="released" label="healthy" font="sans" size="s" color="green" />
      <Edge from="health-gate" to="rollback" label="unhealthy" font="sans" size="s" color="red" />
      <Edge from="rollback" to="deploy-prod" label="previous image tag" font="sans" size="s" dash="dashed" color="red" />

      <Sticky on="rollback">Rollback re-enters the pipeline at the deploy stage; it is not a separate release path.</Sticky>
    </Doc>
  );
}
