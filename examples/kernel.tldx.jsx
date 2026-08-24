import { Doc, Frame, Box, Sticky, Edge } from "tldx";

const RING3 = ["Applications", "Shell", "System daemons", "libc / language runtime"];

const SYSCALLS = [
  { id: "vfs", label: "Virtual file system", via: "open, read" },
  { id: "sched", label: "Process scheduler", via: "fork, exec" },
  { id: "mm", label: "Memory manager", via: "mmap, brk" },
  { id: "net", label: "Network stack", via: "socket" },
  { id: "ipc", label: "IPC / signals", via: "kill, pipe" },
];

const DRIVERS = [
  { id: "blockdrv", label: "Block devices", from: "vfs" },
  { id: "chardrv", label: "Character devices", from: "ipc", optional: true },
  { id: "netdrv", label: "Network interfaces", from: "net" },
];

const HARDWARE = ["CPU / MMU", "RAM", "Disk", "NIC"];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function Layer({ id, name, children }) {
  return (
    <Frame id={id} name={name} layout="row" gap="20" pad="28" align="center">
      {children}
    </Frame>
  );
}

function Tier({ labels, tone, font = "sans", size }) {
  return labels.map((label) => (
    <Box id={slug(label)} label={label} color={tone} fill="semi" font={font} size={size} />
  ));
}

function Rule({ id, label, tone, font = "sans" }) {
  return (
    <Box
      id={id}
      label={label}
      w="900"
      color={tone}
      fill="solid"
      dash="dashed"
      labelColor="white"
      textAlign="middle"
      font={font}
      size="l"
    />
  );
}

export default function KernelArchitecture() {
  return (
    <Doc id="kernel-arch" layout="col" gap="56" align="center" pad="32">
      <Layer id="userspace" name="User space  (ring 3)">
        <Tier labels={RING3} tone="blue" size="l" />
      </Layer>

      <Rule id="syscall" label="System call interface" tone="violet" />

      <Frame id="kernel" name="Kernel  (ring 0)" layout="col" gap="24" pad="28" align="center">
        <Layer id="subsystems" name="Core subsystems">
          {SYSCALLS.map(({ id, label }) => (
            <Box id={id} label={label} color="green" fill="semi" font="sans" />
          ))}
        </Layer>

        <Layer id="drivers" name="Device drivers">
          {DRIVERS.map(({ id, label }) => (
            <Box id={id} label={label} color="orange" fill="semi" font="sans" />
          ))}
        </Layer>

        <Box
          id="hal"
          label="Hardware abstraction layer"
          w="900"
          color="grey"
          fill="solid"
          textAlign="middle"
          font="mono"
        />
      </Frame>

      <Layer id="hardware" name="Hardware">
        <Tier labels={HARDWARE} tone="red" font="mono" />
      </Layer>

      <Edge from="libc-language-runtime" to="syscall" label="trap / syscall" color="violet"
            arrowheadEnd="triangle" font="sans" />

      {SYSCALLS.map(({ id, via }) => (
        <Edge from="syscall" to={id} label={via} color="green"
              arrowheadEnd="triangle" font="sans" size="s" />
      ))}

      {DRIVERS.map(({ id, from, optional }) => (
        <Edge from={from} to={id} color="orange"
              dash={optional ? "dotted" : "draw"} arrowheadEnd="triangle" />
      ))}

      {DRIVERS.map(({ id }) => (
        <Edge from={id} to="hal" color="grey" arrowheadEnd="triangle" />
      ))}

      {HARDWARE.map((label, i) => (
        <Edge
          from="hal"
          to={slug(label)}
          color="red"
          dash={i === 0 ? "draw" : "dashed"}
          label={i === 0 ? "MMIO, DMA, IRQ" : undefined}
          arrowheadStart="triangle"
          arrowheadEnd="triangle"
          font="mono"
          size="s"
        />
      ))}

      <Sticky id="n-syscall" on="syscall" color="violet" font="sans" size="s">
        The only legal way in. Privilege switches from ring 3 to ring 0 here, and every
        argument crossing this line is untrusted until validated.
      </Sticky>

      <Sticky id="n-sched" on="ipc" color="green" font="sans" size="s">
        Scheduling is preemptive: a timer IRQ can suspend any task mid-stream.
      </Sticky>

      <Sticky id="legend" on="hal" color="yellow" font="sans" size="s">
        Solid = calls down. Dashed = device traffic. Dotted = optional.
      </Sticky>
    </Doc>
  );
}
