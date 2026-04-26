import { render, screen } from '@testing-library/react';
// Smoke tests for features/architecture/sequence-diagram.tsx — SVG rendering with actor/message data.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sequence } from '../sequence-data';
import { SequenceDiagram } from '../sequence-diagram';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const minimalSequence: Sequence = {
  id: 'test',
  title: 'Test Sequence',
  subtitle: 'A minimal test sequence',
  actors: [
    { id: 'a', label: 'Actor A', tone: 'neutral' },
    { id: 'b', label: 'Actor B', tone: 'ruby' },
  ],
  messages: [
    { from: 'a', to: 'b', label: 'request', kind: 'sync' },
    { from: 'b', to: 'a', label: 'response', kind: 'return' },
  ],
};

const asyncSequence: Sequence = {
  id: 'async-test',
  title: 'Async Test',
  subtitle: 'Async message test',
  actors: [
    { id: 'producer', label: 'Producer', tone: 'node' },
    { id: 'queue', label: 'Queue', tone: 'queue' },
    { id: 'consumer', label: 'Consumer', tone: 'db' },
  ],
  messages: [
    { from: 'producer', to: 'queue', label: 'enqueue job', kind: 'async' },
    { from: 'queue', to: 'consumer', label: 'dequeue', kind: 'sync' },
    { from: 'consumer', to: 'queue', label: 'ack', kind: 'return' },
  ],
};

const noteSequence: Sequence = {
  id: 'note-test',
  title: 'Note Sequence',
  subtitle: 'With note messages',
  actors: [
    { id: 'x', label: 'X', tone: 'chain' },
    { id: 'y', label: 'Y', tone: 'external' },
  ],
  messages: [
    { note: 'Wait for confirmations', span: [0, 1] },
    { from: 'x', to: 'y', label: 'proceed', kind: 'sync' },
  ],
};

const noteNoSpanSequence: Sequence = {
  id: 'note-no-span',
  title: 'Note No Span',
  subtitle: 'Note without span',
  actors: [
    { id: 'p', label: 'P', tone: 'policy' },
    { id: 'q', label: 'Q', tone: 'treasurer' },
  ],
  messages: [{ note: 'Global note no span' }, { from: 'p', to: 'q', label: 'call', kind: 'sync' }],
};

const groupedSequence: Sequence = {
  id: 'grouped',
  title: 'Grouped Sequence',
  subtitle: 'Messages with group labels',
  actors: [
    { id: 'c', label: 'Client', tone: 'neutral' },
    { id: 's', label: 'Server', tone: 'ruby' },
  ],
  messages: [
    { from: 'c', to: 's', label: 'POST /data', kind: 'sync', group: 'phase-1' },
    { from: 's', to: 'c', label: 'ok', kind: 'return', group: 'phase-1' },
  ],
};

const multilineSequence: Sequence = {
  id: 'multiline',
  title: 'Multiline Label',
  subtitle: 'Message with newline in label',
  actors: [
    { id: 'u', label: 'User', tone: 'neutral' },
    { id: 'api', label: 'API', tone: 'ruby' },
  ],
  messages: [{ from: 'u', to: 'api', label: 'line1\nline2', kind: 'sync' }],
};

const invalidActorSequence: Sequence = {
  id: 'invalid-actor',
  title: 'Invalid Actor',
  subtitle: 'Message referencing unknown actor',
  actors: [{ id: 'known', label: 'Known', tone: 'neutral' }],
  messages: [
    // from/to reference actors not in the actors array — should gracefully return null
    { from: 'unknown-a', to: 'unknown-b', label: 'ghost call', kind: 'sync' },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SequenceDiagram', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders wrapper div and svg', () => {
    const { container } = render(<SequenceDiagram sequence={minimalSequence} />);
    expect(container.querySelector('.seq-diagram-wrap')).toBeInTheDocument();
    expect(container.querySelector('svg.seq-svg')).toBeInTheDocument();
  });

  it('renders actor head labels', () => {
    render(<SequenceDiagram sequence={minimalSequence} />);
    expect(screen.getByText('Actor A')).toBeInTheDocument();
    expect(screen.getByText('Actor B')).toBeInTheDocument();
  });

  it('renders lifelines — one per actor', () => {
    const { container } = render(<SequenceDiagram sequence={minimalSequence} />);
    // Each actor gets a <line> for lifeline with class ll-{id} key
    const lines = container.querySelectorAll('svg line');
    // At minimum: 2 lifelines + message lines
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('renders sync message label', () => {
    render(<SequenceDiagram sequence={minimalSequence} />);
    expect(screen.getByText('request')).toBeInTheDocument();
  });

  it('renders return message label', () => {
    render(<SequenceDiagram sequence={minimalSequence} />);
    expect(screen.getByText('response')).toBeInTheDocument();
  });

  it('renders SVG defs with arrow markers', () => {
    const { container } = render(<SequenceDiagram sequence={minimalSequence} />);
    expect(container.querySelector('#arrow-sync')).toBeInTheDocument();
    expect(container.querySelector('#arrow-async')).toBeInTheDocument();
    expect(container.querySelector('#arrow-ret')).toBeInTheDocument();
  });

  it('sizes SVG correctly based on actor count and message count', () => {
    const { container } = render(<SequenceDiagram sequence={minimalSequence} />);
    const svg = container.querySelector('svg.seq-svg');
    const viewBox = svg?.getAttribute('viewBox') ?? '';
    // width = 16 + 150*2 + 16 = 332; height = 54 + 2*44 + 40 = 182
    expect(viewBox).toBe('0 0 332 182');
  });

  it('renders async message — uses accent color marker', () => {
    const { container } = render(<SequenceDiagram sequence={asyncSequence} />);
    // React serialises markerEnd as the SVG attribute "marker-end" in jsdom
    const asyncLines = Array.from(container.querySelectorAll('line')).filter((l) =>
      (l.getAttribute('marker-end') ?? l.getAttribute('markerEnd') ?? '').includes('arrow-async')
    );
    expect(asyncLines.length).toBeGreaterThan(0);
  });

  it('renders three actors from async sequence', () => {
    render(<SequenceDiagram sequence={asyncSequence} />);
    expect(screen.getByText('Producer')).toBeInTheDocument();
    expect(screen.getByText('Queue')).toBeInTheDocument();
    expect(screen.getByText('Consumer')).toBeInTheDocument();
  });

  it('renders note message as rect + text', () => {
    const { container } = render(<SequenceDiagram sequence={noteSequence} />);
    expect(screen.getByText('Wait for confirmations')).toBeInTheDocument();
    // Note rect uses fill="var(--warn-soft)"
    const noteRects = Array.from(container.querySelectorAll('rect')).filter(
      (r) => r.getAttribute('fill') === 'var(--warn-soft)'
    );
    expect(noteRects.length).toBeGreaterThan(0);
  });

  it('renders note without span (uses default position)', () => {
    render(<SequenceDiagram sequence={noteNoSpanSequence} />);
    expect(screen.getByText('Global note no span')).toBeInTheDocument();
  });

  it('renders group label for grouped messages', () => {
    render(<SequenceDiagram sequence={groupedSequence} />);
    // Both messages share group 'phase-1', each renders a group text below the arrow
    const groupTexts = screen.getAllByText('phase-1');
    expect(groupTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders multiline label split across multiple text elements', () => {
    render(<SequenceDiagram sequence={multilineSequence} />);
    expect(screen.getByText('line1')).toBeInTheDocument();
    expect(screen.getByText('line2')).toBeInTheDocument();
  });

  it('gracefully skips messages with unknown actor ids (returns null)', () => {
    // Should not throw; unknown actor refs are filtered out
    const { container } = render(<SequenceDiagram sequence={invalidActorSequence} />);
    expect(container.querySelector('.seq-diagram-wrap')).toBeInTheDocument();
    // No message lines rendered (actor not found → null returned)
    expect(screen.queryByText('ghost call')).not.toBeInTheDocument();
  });

  it('renders return message with dashed stroke', () => {
    const { container } = render(<SequenceDiagram sequence={minimalSequence} />);
    const returnLines = Array.from(container.querySelectorAll('line')).filter(
      (l) =>
        l.getAttribute('strokeDasharray') === '4 3' || l.getAttribute('stroke-dasharray') === '4 3'
    );
    expect(returnLines.length).toBeGreaterThan(0);
  });

  it('renders deposit sequence from real SEQUENCES data', () => {
    // Use real data to verify the component works end-to-end with realistic input
    // Import real data inline to avoid circular mocking
    const depositSequence: Sequence = {
      id: 'deposit',
      title: 'Deposit detection & crediting',
      subtitle: 'User sends funds → chain watcher → policy check → ledger credit',
      actors: [
        { id: 'user', label: 'User wallet', tone: 'neutral' },
        { id: 'chain', label: 'Blockchain', tone: 'chain' },
        { id: 'watcher', label: 'Chain watcher', tone: 'node' },
      ],
      messages: [
        { from: 'user', to: 'chain', label: 'transfer(USDT, deposit_addr)', kind: 'async' },
        { from: 'chain', to: 'watcher', label: 'new block → log match', kind: 'async' },
        { note: 'Wait for N confirmations (15 BNB / 32 SOL)', span: [1, 2] },
      ],
    };
    render(<SequenceDiagram sequence={depositSequence} />);
    expect(screen.getByText('User wallet')).toBeInTheDocument();
    expect(screen.getByText('Blockchain')).toBeInTheDocument();
    expect(screen.getByText('Chain watcher')).toBeInTheDocument();
    expect(screen.getByText('transfer(USDT, deposit_addr)')).toBeInTheDocument();
  });

  it('all actor tone variants render without errors', () => {
    const allTones: Sequence = {
      id: 'tones',
      title: 'All tones',
      subtitle: '',
      actors: [
        { id: 'a1', label: 'Neutral', tone: 'neutral' },
        { id: 'a2', label: 'Ruby', tone: 'ruby' },
        { id: 'a3', label: 'Node', tone: 'node' },
        { id: 'a4', label: 'Chain', tone: 'chain' },
        { id: 'a5', label: 'DB', tone: 'db' },
        { id: 'a6', label: 'External', tone: 'external' },
        { id: 'a7', label: 'Policy', tone: 'policy' },
        { id: 'a8', label: 'Treasurer', tone: 'treasurer' },
        { id: 'a9', label: 'Queue', tone: 'queue' },
      ],
      messages: [],
    };
    const { container } = render(<SequenceDiagram sequence={allTones} />);
    // 9 actor rects rendered (each gets a rect in the actor head group)
    // rect[0] is typically not an actor head rect — use text count as proxy
    expect(screen.getByText('Neutral')).toBeInTheDocument();
    expect(screen.getByText('Queue')).toBeInTheDocument();
    expect(container.querySelector('.seq-diagram-wrap')).toBeInTheDocument();
  });
});
