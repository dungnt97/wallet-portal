// Service map SVG — 1:1 port of prototype ArchDiagram in page_architecture.jsx.
// Lanes: Identity · Client · Backend · Multisig/Chain · State/Keys.
// Preserves every node metadata line, arrow, and legend entry from the prototype.
export function ServiceMapDiagram() {
  return (
    <svg viewBox="0 0 1040 640" style={{ width: '100%', height: 640 }}>
      <defs>
        <marker
          id="arr"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted)" />
        </marker>
        <marker
          id="arr-accent"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="oklch(55% 0.15 160)" />
        </marker>
        <marker
          id="arr-warn"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--warn-text)" />
        </marker>
        <pattern id="arch-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--line)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="1040" height="640" fill="url(#arch-grid)" opacity="0.4" />

      {/* lane labels */}
      <text
        x="14"
        y="22"
        fontSize="9"
        fontWeight="700"
        fill="var(--text-faint)"
        letterSpacing="0.12em"
      >
        IDENTITY
      </text>
      <text
        x="14"
        y="162"
        fontSize="9"
        fontWeight="700"
        fill="var(--text-faint)"
        letterSpacing="0.12em"
      >
        CLIENT
      </text>
      <text
        x="14"
        y="302"
        fontSize="9"
        fontWeight="700"
        fill="var(--text-faint)"
        letterSpacing="0.12em"
      >
        BACKEND
      </text>
      <text
        x="14"
        y="462"
        fontSize="9"
        fontWeight="700"
        fill="var(--text-faint)"
        letterSpacing="0.12em"
      >
        MULTISIG / CHAIN
      </text>
      <text
        x="14"
        y="582"
        fontSize="9"
        fontWeight="700"
        fill="var(--text-faint)"
        letterSpacing="0.12em"
      >
        STATE / KEYS
      </text>

      {/* === IDENTITY === */}
      <g>
        <rect
          x="80"
          y="32"
          width="220"
          height="90"
          rx="10"
          fill="oklch(96% 0.04 85)"
          stroke="oklch(70% 0.14 85)"
          strokeWidth="1.5"
        />
        <text
          x="190"
          y="58"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="oklch(42% 0.14 85)"
        >
          Google Workspace
        </text>
        <text
          x="190"
          y="76"
          textAnchor="middle"
          fontSize="10"
          fill="oklch(42% 0.14 85)"
          opacity="0.85"
        >
          OIDC SSO · staff directory
        </text>
        <text x="190" y="104" textAnchor="middle" fontSize="9" fill="var(--text-muted)">
          account lifecycle · offboard
        </text>
      </g>
      <g>
        <rect
          x="340"
          y="32"
          width="220"
          height="90"
          rx="10"
          fill="oklch(96% 0.04 85)"
          stroke="oklch(70% 0.14 85)"
          strokeWidth="1.5"
        />
        <text
          x="450"
          y="58"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="oklch(42% 0.14 85)"
        >
          WebAuthn / TOTP
        </text>
        <text
          x="450"
          y="76"
          textAnchor="middle"
          fontSize="10"
          fill="oklch(42% 0.14 85)"
          opacity="0.85"
        >
          platform key / YubiKey
        </text>
        <text x="450" y="104" textAnchor="middle" fontSize="9" fill="var(--text-muted)">
          step-up on write · 5-min TTL
        </text>
      </g>
      <g>
        <rect
          x="600"
          y="32"
          width="220"
          height="90"
          rx="10"
          fill="oklch(95% 0.05 268)"
          stroke="oklch(55% 0.17 268)"
          strokeWidth="1.5"
        />
        <text
          x="710"
          y="58"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="oklch(38% 0.18 268)"
        >
          Ledger HW
        </text>
        <text
          x="710"
          y="76"
          textAnchor="middle"
          fontSize="10"
          fill="oklch(38% 0.18 268)"
          opacity="0.85"
        >
          Treasurer · Nano X
        </text>
        <text x="710" y="104" textAnchor="middle" fontSize="9" fill="var(--text-muted)">
          EIP-712 · keys never leave
        </text>
      </g>
      <g>
        <rect
          x="850"
          y="32"
          width="170"
          height="90"
          rx="10"
          fill="oklch(95% 0.05 268)"
          stroke="oklch(55% 0.17 268)"
          strokeWidth="1.5"
        />
        <text
          x="935"
          y="58"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="oklch(38% 0.18 268)"
        >
          Wallet Ext.
        </text>
        <text
          x="935"
          y="76"
          textAnchor="middle"
          fontSize="10"
          fill="oklch(38% 0.18 268)"
          opacity="0.85"
        >
          MetaMask · Phantom
        </text>
        <text x="935" y="104" textAnchor="middle" fontSize="9" fill="var(--text-muted)">
          EIP-1193 standard
        </text>
      </g>

      {/* === CLIENT === */}
      <g>
        <rect
          x="80"
          y="180"
          width="940"
          height="100"
          rx="10"
          fill="var(--bg-elev)"
          stroke="var(--line-strong)"
          strokeWidth="1.5"
        />
        <text x="110" y="210" fontSize="14" fontWeight="700" fill="var(--text)">
          Admin UI
        </text>
        <text x="110" y="228" fontSize="10" fill="var(--text-muted)">
          React + Vite · TypeScript · portal.wallets.internal
        </text>
        <text x="110" y="254" fontSize="10" fill="var(--text-muted)">
          · Google SSO login · WebAuthn step-up · multisig dashboard · co-sign UI · audit viewer
        </text>
        <text x="110" y="270" fontSize="10" fill="var(--text-muted)">
          · 2/3 Treasurer approvals before any outbound transfer reaches chain
        </text>
      </g>

      {/* === BACKEND === */}
      <g>
        <rect
          x="80"
          y="320"
          width="280"
          height="130"
          rx="10"
          fill="var(--info-soft)"
          stroke="var(--info-line)"
          strokeWidth="1.5"
        />
        <text
          x="220"
          y="344"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="var(--info-text)"
        >
          Admin API
        </text>
        <text
          x="220"
          y="362"
          textAnchor="middle"
          fontSize="10"
          fill="var(--info-text)"
          opacity="0.8"
        >
          Node · Fastify · TypeScript
        </text>
        <line x1="98" y1="376" x2="342" y2="376" stroke="var(--info-line)" />
        <text x="108" y="396" fontSize="10" fill="var(--text-muted)">
          · Deposits / Sweeps / Withdrawals
        </text>
        <text x="108" y="412" fontSize="10" fill="var(--text-muted)">
          · Ledger (double-entry) · audit
        </text>
        <text x="108" y="428" fontSize="10" fill="var(--text-muted)">
          · Google SSO + WebAuthn verify
        </text>
        <text x="108" y="444" fontSize="10" fill="var(--text-muted)">
          · RBAC · Safe/Squads webhooks
        </text>
      </g>

      <g>
        <rect
          x="380"
          y="320"
          width="240"
          height="130"
          rx="10"
          fill="oklch(95% 0.06 160)"
          stroke="oklch(55% 0.15 160)"
          strokeWidth="1.5"
        />
        <text
          x="500"
          y="344"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="oklch(32% 0.14 160)"
        >
          Policy Engine
        </text>
        <text
          x="500"
          y="362"
          textAnchor="middle"
          fontSize="10"
          fill="oklch(32% 0.14 160)"
          opacity="0.85"
        >
          Go · independent pre-sign guard
        </text>
        <line x1="398" y1="376" x2="602" y2="376" stroke="oklch(55% 0.15 160)" />
        <text x="408" y="396" fontSize="10" fill="var(--text-muted)">
          · Authorized-signer check
        </text>
        <text x="408" y="412" fontSize="10" fill="var(--text-muted)">
          · Daily / role limits
        </text>
        <text x="408" y="428" fontSize="10" fill="var(--text-muted)">
          · Destination whitelist
        </text>
        <text x="408" y="444" fontSize="10" fill="var(--text-muted)">
          · Time-lock &amp; expiry
        </text>
      </g>

      <g>
        <rect
          x="640"
          y="320"
          width="240"
          height="130"
          rx="10"
          fill="var(--accent-soft)"
          stroke="var(--accent-line)"
          strokeWidth="1.5"
        />
        <text
          x="760"
          y="344"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="var(--accent-text)"
        >
          Wallet Engine
        </text>
        <text
          x="760"
          y="362"
          textAnchor="middle"
          fontSize="10"
          fill="var(--accent-text)"
          opacity="0.8"
        >
          Node · TypeScript · chain I/O
        </text>
        <line x1="658" y1="376" x2="862" y2="376" stroke="var(--accent-line)" />
        <text x="668" y="396" fontSize="10" fill="var(--text-muted)">
          · HD address derivation
        </text>
        <text x="668" y="412" fontSize="10" fill="var(--text-muted)">
          · Block watcher · confirmations
        </text>
        <text x="668" y="428" fontSize="10" fill="var(--text-muted)">
          · ethers.js + @solana/web3.js
        </text>
        <text x="668" y="444" fontSize="10" fill="var(--text-muted)">
          · Sweep sign / broadcast · RPC pool
        </text>
      </g>

      <g>
        <rect
          x="900"
          y="320"
          width="120"
          height="130"
          rx="10"
          fill="var(--warn-soft)"
          stroke="var(--warn-line)"
        />
        <text
          x="960"
          y="344"
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill="var(--warn-text)"
        >
          Job Queue
        </text>
        <text
          x="960"
          y="362"
          textAnchor="middle"
          fontSize="9"
          fill="var(--warn-text)"
          opacity="0.85"
        >
          Redis · BullMQ
        </text>
        <line x1="918" y1="376" x2="1002" y2="376" stroke="var(--warn-line)" />
        <text x="910" y="396" fontSize="9" fill="var(--text-muted)">
          · deposit_confirm
        </text>
        <text x="910" y="410" fontSize="9" fill="var(--text-muted)">
          · sweep_execute
        </text>
        <text x="910" y="424" fontSize="9" fill="var(--text-muted)">
          · multisig_track
        </text>
        <text x="910" y="438" fontSize="9" fill="var(--text-muted)">
          · audit_emit
        </text>
      </g>

      {/* === MULTISIG / CHAIN === */}
      <g>
        <rect
          x="80"
          y="480"
          width="300"
          height="90"
          rx="10"
          fill="oklch(95% 0.05 268)"
          stroke="oklch(55% 0.17 268)"
          strokeWidth="1.5"
        />
        <text
          x="230"
          y="506"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="oklch(38% 0.18 268)"
        >
          Safe Multisig
        </text>
        <text
          x="230"
          y="524"
          textAnchor="middle"
          fontSize="10"
          fill="oklch(38% 0.18 268)"
          opacity="0.85"
        >
          BNB Chain · 2-of-3 Treasurers
        </text>
        <text x="230" y="544" textAnchor="middle" fontSize="9" fill="var(--text-muted)">
          Safe Tx Service · EIP-712 SafeTx
        </text>
      </g>
      <g>
        <rect
          x="400"
          y="480"
          width="300"
          height="90"
          rx="10"
          fill="oklch(95% 0.05 268)"
          stroke="oklch(55% 0.17 268)"
          strokeWidth="1.5"
        />
        <text
          x="550"
          y="506"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="oklch(38% 0.18 268)"
        >
          Squads Protocol
        </text>
        <text
          x="550"
          y="524"
          textAnchor="middle"
          fontSize="10"
          fill="oklch(38% 0.18 268)"
          opacity="0.85"
        >
          Solana · v4 PDA · 2-of-3
        </text>
        <text x="550" y="544" textAnchor="middle" fontSize="9" fill="var(--text-muted)">
          Proposal + Approve · Ed25519
        </text>
      </g>
      <g>
        <rect
          x="720"
          y="480"
          width="300"
          height="90"
          rx="10"
          fill="var(--bg-elev)"
          stroke="var(--line-strong)"
        />
        <text x="870" y="506" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text)">
          RPC pool
        </text>
        <text x="870" y="524" textAnchor="middle" fontSize="10" fill="var(--text-muted)">
          primary + backup per chain
        </text>
        <text x="870" y="544" textAnchor="middle" fontSize="9" fill="var(--text-faint)">
          health-ping 30s
        </text>
      </g>

      {/* === STATE / KEYS === */}
      <g>
        <rect
          x="80"
          y="596"
          width="280"
          height="36"
          rx="8"
          fill="var(--bg-elev)"
          stroke="var(--line-strong)"
        />
        <text x="100" y="620" fontSize="12" fontWeight="700" fill="var(--text)">
          Postgres
        </text>
        <text x="180" y="620" fontSize="10" fill="var(--text-muted)">
          users · ledger · deposits · audit · policies
        </text>
      </g>
      <g>
        <rect
          x="380"
          y="596"
          width="220"
          height="36"
          rx="8"
          fill="var(--bg-elev)"
          stroke="var(--line-strong)"
        />
        <text x="400" y="620" fontSize="12" fontWeight="700" fill="var(--text)">
          Vault / KMS
        </text>
        <text x="478" y="620" fontSize="10" fill="var(--text-muted)">
          HD seed · sweep key
        </text>
      </g>
      <g>
        <rect
          x="620"
          y="596"
          width="280"
          height="36"
          rx="8"
          fill="oklch(96% 0.04 85)"
          stroke="oklch(70% 0.14 85)"
        />
        <text x="640" y="620" fontSize="12" fontWeight="700" fill="oklch(42% 0.14 85)">
          Wallet Registry
        </text>
        <text x="752" y="620" fontSize="10" fill="var(--text-muted)">
          staff → addrs · 48h lock
        </text>
      </g>
      <g>
        <rect
          x="920"
          y="596"
          width="100"
          height="36"
          rx="8"
          fill="var(--bg-elev)"
          stroke="var(--line-strong)"
        />
        <text x="970" y="620" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text)">
          S3
        </text>
        <text x="970" y="632" textAnchor="middle" fontSize="9" fill="var(--text-muted)">
          audit export
        </text>
      </g>

      {/* === arrows === */}
      <g strokeWidth="1.5" fill="none">
        <path d="M 190 122 L 190 180" stroke="oklch(70% 0.14 85)" markerEnd="url(#arr)" />
        <path d="M 450 122 L 450 180" stroke="oklch(70% 0.14 85)" markerEnd="url(#arr)" />
        <path d="M 820 76 L 860 76" stroke="var(--text-muted)" markerEnd="url(#arr)" />
        <path d="M 940 122 L 940 180" stroke="oklch(55% 0.17 268)" markerEnd="url(#arr)" />

        <path d="M 220 280 L 220 320" stroke="var(--text-muted)" markerEnd="url(#arr)" />
        <path
          d="M 760 280 L 760 320"
          stroke="oklch(55% 0.15 160)"
          strokeWidth="2"
          markerEnd="url(#arr-accent)"
        />

        <path
          d="M 360 385 L 380 385"
          stroke="oklch(55% 0.15 160)"
          strokeWidth="2"
          markerEnd="url(#arr-accent)"
          markerStart="url(#arr-accent)"
        />
        <path
          d="M 620 385 L 640 385"
          stroke="oklch(55% 0.15 160)"
          strokeWidth="2"
          markerEnd="url(#arr-accent)"
          markerStart="url(#arr-accent)"
        />
        <path
          d="M 880 385 L 900 385"
          stroke="var(--warn-text)"
          markerEnd="url(#arr-warn)"
          markerStart="url(#arr-warn)"
        />
        <path
          d="M 360 340 C 600 300, 900 300, 960 320"
          stroke="var(--warn-text)"
          strokeDasharray="4 3"
          markerEnd="url(#arr-warn)"
        />

        <path d="M 450 450 L 230 480" stroke="oklch(55% 0.17 268)" markerEnd="url(#arr)" />
        <path d="M 520 450 L 550 480" stroke="oklch(55% 0.17 268)" markerEnd="url(#arr)" />

        <path d="M 720 450 L 300 480" stroke="var(--text-muted)" strokeDasharray="3 3" />
        <path d="M 780 450 L 620 480" stroke="var(--text-muted)" strokeDasharray="3 3" />
        <path d="M 840 450 L 870 480" stroke="var(--text-muted)" markerEnd="url(#arr)" />

        <path d="M 380 525 L 720 525" stroke="var(--text-faint)" strokeDasharray="3 3" />
        <path d="M 700 525 L 720 525" stroke="var(--text-faint)" markerEnd="url(#arr)" />

        <path
          d="M 220 450 L 220 596"
          stroke="var(--text-muted)"
          markerEnd="url(#arr)"
          markerStart="url(#arr)"
        />
        <path d="M 700 450 L 490 596" stroke="var(--text-muted)" markerEnd="url(#arr)" />
        <path d="M 520 450 L 760 596" stroke="oklch(55% 0.15 160)" markerEnd="url(#arr-accent)" />
        <path
          d="M 340 440 C 900 550, 970 550, 970 596"
          stroke="var(--text-muted)"
          strokeDasharray="4 3"
          markerEnd="url(#arr)"
        />
      </g>

      {/* legend */}
      <g transform="translate(80, 136)">
        <text
          x="0"
          y="0"
          fontSize="9"
          fontWeight="700"
          fill="var(--text-faint)"
          letterSpacing="0.1em"
        >
          LEGEND
        </text>
        <line x1="70" y1="-3" x2="90" y2="-3" stroke="oklch(55% 0.15 160)" strokeWidth="2" />
        <text x="96" y="0" fontSize="9" fill="var(--text-muted)">
          Policy-gated path
        </text>
        <line
          x1="220"
          y1="-3"
          x2="240"
          y2="-3"
          stroke="var(--warn-text)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        <text x="246" y="0" fontSize="9" fill="var(--text-muted)">
          Async enqueue
        </text>
        <line
          x1="350"
          y1="-3"
          x2="370"
          y2="-3"
          stroke="var(--text-muted)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        <text x="376" y="0" fontSize="9" fill="var(--text-muted)">
          Optional / read
        </text>
        <line x1="480" y1="-3" x2="500" y2="-3" stroke="oklch(70% 0.14 85)" strokeWidth="2" />
        <text x="506" y="0" fontSize="9" fill="var(--text-muted)">
          Auth
        </text>
      </g>
    </svg>
  );
}
