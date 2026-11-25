// Sample article: "Consistent Hashing" (complete system-design write-up with one slide per section).
// Used by scripts/build-seed.mjs and scripts/db-refresh-samples.mjs. Layout 40:60 → slides are 1600 × 1200.
import { C, CODE, H3, MORE, NOTE, OL, P, TABLE, UL, polar } from './draw.mjs';

const W = 1600;
const title = (k, t, sub) => {
  k.text(W / 2, 40, t, { size: 46, align: 'center' });
  if (sub) k.text(W / 2, 104, sub, { size: 26, align: 'center', color: C.muted });
};

// ---- shared ring pieces ----
function ring(k, cx, cy, r, { ticks = false } = {}) {
  k.ellipse(cx, cy, r, r, { stroke: C.slate.stroke, sw: 2, dashed: true });
  if (ticks) {
    [[0, '0'], [90, '1/4'], [180, '1/2'], [270, '3/4']].forEach(([d, l]) => {
      const [a, b] = polar(cx, cy, r - 14, d), [c2, d2] = polar(cx, cy, r + 14, d);
      k.line([[a, b], [c2, d2]], { stroke: C.slate.stroke, sw: 3 });
      const [lx, ly] = polar(cx, cy, r + 46, d);
      k.text(lx, ly - 16, l, { size: 26, align: 'center', color: C.muted });
    });
  }
}
/** Ownership arcs: [[fromDeg, toDeg, tone], …] drawn on the ring. */
function owners(k, cx, cy, r, arcs, sw = 12) {
  arcs.forEach(([a, b, tone]) => k.arc(cx, cy, r, a + 2, b - 2, { stroke: tone.stroke, sw }));
}

export const consistentHashing = {
  key: 'hash', owner: 1, slug: 'consistent-hashing', title: 'Consistent Hashing', state: 'draft', layout: '40-60',
  tags: ['system-design', 'distributed-systems', 'caching'],
  summary: 'How to spread keys over servers so that adding or losing a server moves only a few keys: the hash ring, virtual nodes, replication, hot keys, alternatives and where it is used.',
  sections: [
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Why naive hashing breaks',
      body: [
        P('You run **N cache servers** in front of a database and need to decide which server stores each key. The obvious rule is `server = hash(key) % N`: fast, stateless, and every client computes the same answer.'),
        P('It works until **N changes**. Add one server (more traffic) or lose one (a crash), and almost every key suddenly maps to a different server. The caches are effectively empty, every request falls through to the database at once, and the database can fall over. This is a **cache stampede**.'),
        NOTE('red', 'With `% N`, going from N to N+1 servers moves about **N/(N+1)** of all keys: 75% when growing from 3 to 4 servers, 99% when growing from 100 to 101.'),
        TABLE(['Servers (before → after)', 'Keys moved with `% N`', 'Keys moved with consistent hashing'], [
          ['3 → 4', '75%', '25%'],
          ['10 → 11', '91%', '9%'],
          ['100 → 101', '99%', '1%']
        ]),
        MORE('sky', 'Why does modulo move N/(N+1) of the keys?', [
          'A key stays on the same server only if `h % N == h % (N+1)`. For uniformly random `h` that happens for N out of every N·(N+1) values, i.e. with probability **1/(N+1)**. So the fraction that moves is **1 − 1/(N+1) = N/(N+1)**.',
          'The drawing shows it with 8 keys whose hashes are 10…17: five of the eight change server when we go from 3 to 4 servers.'
        ], 'detail'),
        P('What we want instead: when a server joins or leaves, **only the keys that must move** should move. That is about **K/N** keys (K keys, N servers), the new server\'s fair share. This is exactly what **consistent hashing** guarantees. It was introduced by Karger et al. at MIT in 1997 for web caching and became the basis of Akamai\'s CDN.'),
        UL(['`hash(key) % N` remaps ~N/(N+1) of keys whenever N changes → cold caches, database stampede', 'Goal: move only ~K/N keys on any membership change'], 'brief')
      ],
      draw(k) {
        title(k, 'hash(key) % N: what happens when N changes?', 'Same 8 keys, 3 servers → 4 servers');
        const cols = [['Key', 160, 200], ['hash(key)', 360, 240], ['% 3 (before)', 600, 260], ['% 4 (after)', 860, 260], ['Moved?', 1120, 300]];
        const y0 = 180, rh = 66;
        cols.forEach(([t, x, w]) => k.box(x, y0, w, rh, t, { tone: C.slate, size: 28 }));
        for (let i = 0; i < 8; i++) {
          const h = 10 + i, a = h % 3, b = h % 4, moved = a !== b, y = y0 + rh * (i + 1);
          const tone = moved ? C.rose : { stroke: '#cbd5e1', fill: '#ffffff' };
          [[`k${i + 1}`], [String(h)], [`S${a}`], [`S${b}`], [moved ? 'yes' : 'no']].forEach(([t], j) =>
            k.box(cols[j][1], y, cols[j][2], rh, t, { tone, size: 28, color: moved && j >= 3 ? C.rose.stroke : C.ink }));
        }
        k.box(160, 830, 1260, 150, '5 of 8 keys moved (theory: N/(N+1) = 75%)\n→ caches go cold, every miss hits the database', { tone: C.rose, size: 32 });
        k.box(160, 1020, 1260, 110, 'We want: only the new server\'s fair share (~K/N keys) to move', { tone: C.green, size: 32 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'The hash ring',
      body: [
        P('Take the output range of a hash function, for example **0 to 2³²−1**, and **bend it into a circle**: after the largest value comes 0 again. This circle is the **hash ring**.'),
        P('Now hash **servers and keys with the same function**, so both land somewhere on the ring. A server\'s position is usually `hash(server id or IP)`; a key\'s position is `hash(key)`.'),
        NOTE('mint', 'The ring is only a picture. In code it is a **sorted list of numbers** that wraps around at the end.'),
        MORE('sky', 'Which hash function?', [
          'It must spread values **uniformly** and give the **same result on every machine and in every language**, because clients and servers must agree.',
          'Common choices: **MurmurHash3** or **xxHash** (fast, not cryptographic), or the first bytes of **MD5** (used by the classic memcached *ketama* library). Never use a language\'s built-in `hashCode()`/`hash()`: it can differ between processes, versions or platforms.'
        ], 'detail'),
        UL(['Hash space 0…2³²−1 wraps around into a ring', 'Servers and keys are hashed with the same, stable function'], 'brief')
      ],
      draw(k) {
        title(k, 'Bend the hash space into a ring');
        const cx = 600, cy = 650, r = 380;
        ring(k, cx, cy, r, { ticks: true });
        k.arc(cx, cy, r + 90, 18, 72, { stroke: C.teal.stroke, sw: 4, arrow: true });
        const [lx, ly] = polar(cx, cy, r + 150, 45);
        k.text(lx, ly - 18, 'clockwise', { size: 28, color: C.teal.stroke, align: 'center' });
        k.text(cx, cy - 60, '0 … 2³² − 1', { size: 40, align: 'center' });
        k.text(cx, cy + 4, 'after the last value\ncomes 0 again', { size: 28, align: 'center', color: C.muted });
        k.box(1080, 260, 460, 150, 'server\nhash("cache-A") → 0.21', { tone: C.teal, size: 28 });
        k.box(1080, 450, 460, 150, 'key\nhash("user:42") → 0.63', { tone: C.amber, size: 28 });
        k.box(1080, 640, 460, 150, 'same hash function\nfor both', { tone: C.sky, size: 30 });
        k.text(1310, 830, '(positions shown as\nfractions of the ring)', { size: 24, align: 'center', color: C.muted });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: "Finding a key's server",
      body: [
        P('To find a key\'s server, start at the key\'s position and **walk clockwise** until you reach a server. That server owns the key.'),
        OL(['Hash the key → position `p`.', 'Find the first server whose position is **≥ p**.', 'None? **Wrap around** to the first server on the ring.']),
        P('So every server owns the **arc between the previous server and itself**. In the drawing, A owns (C, A], B owns (A, B] and C owns (B, C]. Key k3 sits between B and C, so it belongs to C.'),
        P('Every client that knows the same server list computes the same answer **without asking anyone**. That is why memcached client libraries could shard data on their own, with no central router.', 'detail'),
        UL(['Owner = first server clockwise from the key (wrap around at the end)', 'Each server owns the arc (previous server, itself]'], 'brief')
      ],
      draw(k) {
        title(k, 'Walk clockwise to the first server');
        const cx = 600, cy = 660, r = 380;
        ring(k, cx, cy, r);
        owners(k, cx, cy, r, [[30, 150, C.amber], [150, 260, C.violet], [260, 390, C.teal]]);
        k.node(cx, cy, r, 30, 'A', { tone: C.teal }).node(cx, cy, r, 150, 'B', { tone: C.amber }).node(cx, cy, r, 260, 'C', { tone: C.violet });
        [[70, 'k1', C.amber], [120, 'k2', C.amber], [200, 'k3', C.violet], [300, 'k4', C.teal], [350, 'k5', C.teal]]
          .forEach(([d, l, t]) => k.key(cx, cy, r, d, l, { tone: t }));
        k.arc(cx, cy, r - 95, 204, 252, { stroke: C.violet.stroke, sw: 3, dashed: true, arrow: true });
        const [tx, ty] = polar(cx, cy, r - 170, 228);
        k.text(tx, ty - 16, 'k3 → C', { size: 28, align: 'center', color: C.violet.stroke });
        k.box(1080, 250, 460, 110, 'A owns (C, A]  →  k4, k5', { tone: C.teal, size: 28 });
        k.box(1080, 390, 460, 110, 'B owns (A, B]  →  k1, k2', { tone: C.amber, size: 28 });
        k.box(1080, 530, 460, 110, 'C owns (B, C]  →  k3', { tone: C.violet, size: 28 });
        k.text(1080, 700, '1. p = hash(key)\n2. first server ≥ p\n3. none? wrap to the first', { size: 30 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Adding and removing servers',
      body: [
        P('**Adding a server D** between A and B: D takes over only the keys between A and D, which used to belong to B. Every other key stays exactly where it was.'),
        P('**Removing a server** (or a crash): its keys move to the **next server clockwise**. Again, no other key moves.'),
        NOTE('mint', 'On average only **K/N keys move** (K keys, N servers). That is the minimum possible: the new server has to get its fair share from somewhere.'),
        P('The catch: a new server relieves only **one** neighbour, and a removed server dumps its whole load on **one** neighbour. With few servers that is very uneven. Virtual nodes, in the next section, fix it.', 'detail'),
        MORE('sky', 'Worked example: 4 servers, 1 million keys, add a 5th', [
          '**Modulo:** about 800,000 keys move (4/5 of them). The cache hit rate collapses.',
          '**Ring:** about 200,000 keys move (1/5), all taken from one neighbour.',
          '**Ring with virtual nodes:** still about 200,000 keys, but ~50,000 come from each of the four old servers, so the load stays even.'
        ]),
        UL(['Add: the new server takes keys only from its clockwise neighbour', 'Remove: its keys go to the next server clockwise', 'Only ~K/N keys move'], 'brief')
      ],
      draw(k) {
        title(k, 'Only the neighbouring arc moves');
        const r = 270, cy = 560;
        const L = 400, R = 1200;
        ring(k, L, cy, r);
        owners(k, L, cy, r, [[30, 150, C.amber], [150, 260, C.violet], [260, 390, C.teal]], 10);
        k.node(L, cy, r, 30, 'A', { tone: C.teal, dot: 24 }).node(L, cy, r, 150, 'B', { tone: C.amber, dot: 24 }).node(L, cy, r, 260, 'C', { tone: C.violet, dot: 24 });
        k.key(L, cy, r, 70, 'k1', { tone: C.amber }).key(L, cy, r, 120, 'k2', { tone: C.amber }).key(L, cy, r, 200, 'k3', { tone: C.violet });
        k.text(L, 190, 'Before: A, B, C', { size: 32, align: 'center' });

        ring(k, R, cy, r);
        owners(k, R, cy, r, [[30, 100, C.green], [100, 150, C.amber], [150, 260, C.violet], [260, 390, C.teal]], 10);
        k.node(R, cy, r, 30, 'A', { tone: C.teal, dot: 24 }).node(R, cy, r, 100, 'D (new)', { tone: C.green, dot: 24, labelGap: 80 })
          .node(R, cy, r, 150, 'B', { tone: C.amber, dot: 24 }).node(R, cy, r, 260, 'C', { tone: C.violet, dot: 24 });
        k.key(R, cy, r, 70, 'k1', { tone: C.rose }).key(R, cy, r, 120, 'k2', { tone: C.amber }).key(R, cy, r, 200, 'k3', { tone: C.violet });
        k.text(R, 190, 'After adding D', { size: 32, align: 'center' });
        k.arrow([[700, 560], [880, 560]], { stroke: C.green.stroke, sw: 4 });
        k.text(790, 500, 'add D', { size: 28, align: 'center', color: C.green.stroke });

        k.box(140, 920, 1320, 100, 'Only k1 moves (B → D). k2 and k3 stay put.', { tone: C.rose, size: 32 });
        k.box(140, 1050, 1320, 100, 'Remove D → its keys go to the next server clockwise (B)', { tone: C.slate, size: 30 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Virtual nodes',
      body: [
        P('With only a few random positions, the arcs have very different lengths, so one server can own half the ring. **Virtual nodes** (vnodes) fix this: each physical server is placed at **many** positions, for example `hash("A#1")`, `hash("A#2")` … `hash("A#200")`.'),
        P('Many small arcs average out, so each server ends up with close to its fair share of keys.'),
        UL([
          '**Even load:** the spread between servers shrinks roughly like 1/√V (V = vnodes per server).',
          '**Smooth scaling:** a new server takes a small slice from **every** other server, not just one neighbour.',
          '**Graceful failure:** a failed server\'s load spreads over all survivors.',
          '**Different machine sizes:** give a bigger machine more vnodes (weighting).'
        ]),
        MORE('sky', 'How uneven is it without virtual nodes?', [
          'With one random position per server, the largest arc is about **(ln N)/N** of the ring, i.e. about ln N times the fair share. With 10 servers the busiest server typically gets more than twice the average load.',
          'With 100–200 vnodes per server the busiest server is usually within about 10% of the average.'
        ], 'detail'),
        P('Costs: the lookup table grows to N × V entries (still small: 100 servers × 200 vnodes = 20,000 numbers), and rebalancing moves many small ranges instead of one big one. Cassandra used 256 vnodes per node for years, then lowered the default to 16 together with a smarter token-allocation algorithm.', 'detail'),
        UL(['Each server gets many positions: A#1, A#2, … (typically 100–256)', 'Evens out load, spreads joins/failures over all servers, enables weights'], 'brief')
      ],
      draw(k) {
        title(k, 'One position per server vs. virtual nodes');
        const r = 220, cy = 470, L = 400, R = 1200;
        ring(k, L, cy, r);
        owners(k, L, cy, r, [[10, 60, C.amber], [60, 120, C.violet], [120, 370, C.teal]], 10);
        k.node(L, cy, r, 10, 'A', { tone: C.teal, dot: 22, labelGap: 50 }).node(L, cy, r, 60, 'B', { tone: C.amber, dot: 22, labelGap: 50 })
          .node(L, cy, r, 120, 'C', { tone: C.violet, dot: 22, labelGap: 50 });
        k.text(L, 140, '1 position per server', { size: 30, align: 'center' });

        ring(k, R, cy, r);
        const v = [['A1', C.teal], ['B1', C.amber], ['C1', C.violet], ['A2', C.teal], ['B2', C.amber], ['C2', C.violet], ['A3', C.teal], ['B3', C.amber], ['C3', C.violet]];
        owners(k, R, cy, r, v.map(([, t], i) => [i * 40 - 40, i * 40, t]), 10);
        v.forEach(([l, t], i) => k.node(R, cy, r, i * 40, l, { tone: t, dot: 16, size: 24, labelGap: 44 }));
        k.text(R, 140, '3 virtual nodes per server', { size: 30, align: 'center' });

        const bars = (x0, vals) => {
          k.line([[x0 - 20, 1100], [x0 + 520, 1100]], { stroke: C.slate.stroke });
          vals.forEach(([l, pct, t], i) => {
            const h = pct * 3.4, x = x0 + i * 180;
            k.rect(x, 1100 - h, 120, h, { stroke: t.stroke, fill: t.fill });
            k.text(x + 60, 1100 - h - 40, `${pct}%`, { size: 28, align: 'center', color: t.stroke });
            k.text(x + 60, 1110, l, { size: 28, align: 'center' });
          });
        };
        bars(160, [['A', 69, C.teal], ['B', 14, C.amber], ['C', 17, C.violet]]);
        bars(960, [['A', 33, C.teal], ['B', 34, C.amber], ['C', 33, C.violet]]);
        k.text(400, 745, 'share of keys', { size: 24, align: 'center', color: C.muted });
        k.text(1200, 745, 'share of keys', { size: 24, align: 'center', color: C.muted });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Implementation',
      body: [
        P('In code, the ring is just a **sorted array of (position, server)** pairs. A lookup is a **binary search** for the first position ≥ hash(key), wrapping to index 0 at the end.'),
        CODE('python', `import bisect
import hashlib


def h(s: str) -> int:
    """Stable 64-bit hash: same result on every machine and in every process."""
    return int.from_bytes(hashlib.md5(s.encode()).digest()[:8], "big")


class HashRing:
    def __init__(self, vnodes: int = 100):
        self.vnodes = vnodes
        self.tokens: list[int] = []        # sorted ring positions
        self.owner: dict[int, str] = {}    # position -> server

    def add(self, server: str) -> None:
        for i in range(self.vnodes):
            t = h(f"{server}#{i}")
            bisect.insort(self.tokens, t)
            self.owner[t] = server

    def remove(self, server: str) -> None:
        for i in range(self.vnodes):
            t = h(f"{server}#{i}")
            self.tokens.remove(t)
            del self.owner[t]

    def get(self, key: str) -> str:
        if not self.tokens:
            raise LookupError("no servers")
        i = bisect.bisect_left(self.tokens, h(key))
        return self.owner[self.tokens[i % len(self.tokens)]]   # wrap around


ring = HashRing()
for s in ("cache-a", "cache-b", "cache-c"):
    ring.add(s)
print(ring.get("user:42"))`),
        TABLE(['Operation', 'Cost', 'Notes'], [
          ['Lookup', '`O(log(N·V))`', 'Binary search over N servers × V vnodes'],
          ['Add / remove a server', '`O(V · log(N·V))`', 'Plus moving ~K/N keys of data'],
          ['Memory', '`O(N·V)`', '100 servers × 200 vnodes = 20,000 entries']
        ]),
        MORE('sky', 'Production notes', [
          '**Rebuild, don\'t mutate:** build a new sorted array on each membership change and swap it in atomically, so lookups never take a lock.',
          '**Membership** comes from a coordination service (ZooKeeper, etcd, Consul) or a gossip protocol (Cassandra, Dynamo). All clients must converge on the same server list, or they will disagree about owners.',
          '**Token collisions** between two servers are astronomically rare with 64-bit hashes; break ties by server id if you want to be strict.'
        ], 'detail'),
        UL(['Sorted array of (token, server) + binary search', 'Lookup O(log(N·V)); wrap to index 0 past the end'], 'brief')
      ],
      draw(k) {
        title(k, 'The ring in memory: a sorted array');
        const toks = [[12, 'A', C.teal], [87, 'C', C.violet], [140, 'B', C.amber], [201, 'A', C.teal], [255, 'B', C.amber], [310, 'C', C.violet]];
        const x0 = 110, y = 300, w = 220, gap = 10;
        k.text(x0, 240, 'tokens (sorted) → owner', { size: 28, color: C.muted });
        toks.forEach(([t, s, tone], i) => k.box(x0 + i * (w + gap), y, w, 120, `${t}\n${s}`, { tone, size: 34 }));
        // lookup 150 → 201
        const bx = x0 + 3 * (w + gap);
        k.box(560, 560, 520, 110, 'hash(key) = 150', { tone: C.slate, size: 32 });
        k.arrow([[900, 560], [bx + w / 2, y + 128]], { stroke: C.teal.stroke, sw: 3 });
        k.text(1180, 500, 'binary search:\nfirst token ≥ 150\n→ 201 (A)', { size: 28, color: C.teal.stroke });
        // wrap-around 330 → 12
        k.box(560, 760, 520, 110, 'hash(key) = 330', { tone: C.slate, size: 32 });
        k.arrow([[560, 815], [200, 815], [200, 430]], { stroke: C.rose.stroke, sw: 3, dashed: true });
        k.text(230, 880, 'past the end → wrap to index 0 → 12 (A)', { size: 28, color: C.rose.stroke });
        k.box(110, 1010, 1380, 110, 'lookup O(log(N·V))   ·   add/remove O(V·log(N·V))   ·   memory O(N·V)', { tone: C.sky, size: 30 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Replication',
      body: [
        P('Servers fail, so important data is stored on **several servers**. With a replication factor of 3, a key lives on its owner plus the **next 2 distinct physical servers** clockwise. Amazon\'s Dynamo calls this list the key\'s **preference list**.'),
        P('With virtual nodes you must **skip positions belonging to a server that is already in the list**. Otherwise two "replicas" could be the same machine, and one crash would lose both.'),
        NOTE('red', 'Replication factor 3 survives losing any 2 of the 3 servers, but only if they are really different machines, ideally in different racks or availability zones.'),
        H3('Quorums', 'detail'),
        P('With N replicas, a write waits for **W** acknowledgements and a read asks **R** replicas. If **R + W > N**, every read set overlaps the latest write set, so reads see the newest value (for example N = 3, W = 2, R = 2). Lower W or R trades consistency for latency and availability.', 'detail'),
        MORE('sky', 'Sloppy quorum and hinted handoff', [
          'If a replica is down, Dynamo-style systems write to the **next healthy server** on the ring instead, with a *hint* saying who the data really belongs to. When the original server comes back, the data is handed back to it. Writes keep succeeding during short outages.',
          'Rack/zone awareness (e.g. Cassandra\'s NetworkTopologyStrategy) keeps walking the ring until replicas are in different racks or zones.'
        ], 'detail'),
        UL(['Replicas = owner + next R−1 distinct physical servers clockwise', 'Skip vnodes of servers already chosen; spread over racks/zones', 'R + W > N → reads see the latest write'], 'brief')
      ],
      draw(k) {
        title(k, 'Replicas: walk on to the next distinct servers');
        const cx = 520, cy = 640, r = 300;
        ring(k, cx, cy, r);
        const nodes = [[20, 'A', C.slate], [80, 'B', C.teal], [140, 'C', C.teal], [200, 'D', C.teal], [260, 'E', C.slate], [320, 'F', C.slate]];
        nodes.forEach(([d, l, t]) => k.node(cx, cy, r, d, l, { tone: t, dot: 28 }));
        k.key(cx, cy, r, 50, 'k', { tone: C.rose, size: 30, dot: 14 });
        k.arc(cx, cy, r + 90, 52, 78, { stroke: C.teal.stroke, sw: 3, arrow: true });
        k.arc(cx, cy, r + 90, 82, 138, { stroke: C.teal.stroke, sw: 3, arrow: true });
        k.arc(cx, cy, r + 90, 142, 198, { stroke: C.teal.stroke, sw: 3, arrow: true });
        [[66, '1'], [110, '2'], [170, '3']].forEach(([d, l]) => { const [x, y] = polar(cx, cy, r + 135, d); k.text(x, y - 18, l, { size: 34, align: 'center', color: C.teal.stroke }); });
        k.box(1060, 230, 480, 130, 'preference list for k:\nB (owner) → C → D', { tone: C.teal, size: 30 });
        k.box(1060, 400, 480, 130, 'skip vnodes of servers\nalready chosen', { tone: C.amber, size: 30 });
        k.box(1060, 570, 480, 170, 'N = 3, W = 2, R = 2\nR + W > N\n→ reads see the latest write', { tone: C.sky, size: 30 });
        k.box(1060, 780, 480, 170, 'C down? E takes the write\nwith a hint and hands it\nback later', { tone: C.rose, size: 28 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Hot keys and uneven load',
      body: [
        P('Consistent hashing balances **keys**, not **traffic**. One very popular key (a celebrity\'s profile, a viral post) still lives on one server and can overload it. The usual fixes:'),
        TABLE(['Technique', 'How it works', 'Trade-off'], [
          ['**Weights**', 'More vnodes for bigger machines, so they own more of the ring', 'Static: doesn\'t react to traffic'],
          ['**Bounded loads**', 'Cap every server at (1+ε) × the average load; if the owner is full, keep walking clockwise', 'A few keys move as load shifts'],
          ['**Hot-key splitting**', 'Store the hot key as `key#1 … key#k` on several servers; read a random copy', 'Writes must update every copy'],
          ['**Local / near cache**', 'Keep the hottest keys in the client or proxy memory for a few seconds', 'Slightly stale reads']
        ]),
        MORE('sky', 'Consistent hashing with bounded loads', [
          'Proposed by Mirrokni, Thorup and Zadimoghaddam (Google, 2017). Each server accepts at most ⌈(1+ε) · average⌉ requests or connections. A key whose owner is full goes to the next server clockwise that has room.',
          'It keeps most of consistent hashing\'s stability while guaranteeing that no server is overloaded. Vimeo used it for video caching, and HAProxy supports it (`hash-balance-factor`).'
        ], 'detail'),
        UL(['Balances keys, not traffic: hot keys still overload one server', 'Fixes: weights, bounded loads (1+ε), hot-key splitting, local caches'], 'brief')
      ],
      draw(k) {
        title(k, 'Balanced keys ≠ balanced traffic');
        // bounded loads bins
        const base = 760, cap = 330;
        k.text(110, 170, 'Bounded loads: cap = (1+ε) × average', { size: 30 });
        [[160, 'A', 300, C.teal], [400, 'B', 330, C.amber], [640, 'C', 150, C.violet]].forEach(([x, l, h, t]) => {
          k.rect(x, base - h, 160, h, { stroke: t.stroke, fill: t.fill });
          k.text(x + 80, base + 12, l, { size: 30, align: 'center' });
        });
        k.line([[120, base - cap], [860, base - cap]], { stroke: C.rose.stroke, sw: 3, dashed: true });
        k.text(870, base - cap - 18, 'cap', { size: 28, color: C.rose.stroke });
        k.arrow([[540, base - cap - 20], [640, base - cap - 60], [720, base - 170]], { stroke: C.rose.stroke, sw: 3 });
        k.text(300, base - cap - 140, 'B is full → the next key\ngoes on to C', { size: 26, color: C.rose.stroke });
        // hot key splitting
        k.text(1000, 170, 'Hot-key splitting', { size: 30 });
        k.box(1080, 240, 380, 100, '"celebrity:1"', { tone: C.rose, size: 30 });
        [['#1', 1000], ['#2', 1190], ['#3', 1380]].forEach(([l, x]) => {
          k.arrow([[1270, 345], [x + 70, 470]], { stroke: C.rose.stroke, sw: 2 });
          k.box(x, 480, 140, 90, l, { tone: C.slate, size: 28 });
        });
        k.text(1230, 600, 'copies on 3 servers,\nread a random one', { size: 26, align: 'center', color: C.muted });
        k.box(110, 900, 1380, 100, 'Weights: bigger machine → more vnodes → bigger share of the ring', { tone: C.sky, size: 30 });
        k.box(110, 1030, 1380, 100, 'Near cache: keep the hottest keys in client/proxy memory for a few seconds', { tone: C.green, size: 30 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Alternatives',
      body: [
        P('The ring with virtual nodes is not the only way to get "minimal movement". Know the alternatives and when each one wins:'),
        TABLE(['Approach', 'Lookup', 'Memory', 'Balance', 'Membership changes', 'Best for'], [
          ['**Ring + vnodes**', '`O(log(N·V))`', '`O(N·V)`', 'Good (more vnodes = better)', 'Any server, any time', 'Caches and storage clusters that grow and fail'],
          ['**Rendezvous (HRW)**', '`O(N)`', '`O(N)`', 'Excellent', 'Any server, any time', 'Small server sets (up to ~100), simple code'],
          ['**Jump consistent hash**', '`O(log N)`', '`O(1)`', 'Perfect', 'Only add/remove the **last** bucket', 'Numbered shards of a storage system'],
          ['**Maglev**', '`O(1)`', 'Fixed table (e.g. 65,537)', 'Near perfect', 'Any; a few % of keys move', 'Packet / connection load balancers'],
          ['**Range sharding**', '`O(log S)` (metadata)', 'Range table', 'Managed by splits', 'Move ranges explicitly', 'Ordered keys and range scans (Bigtable, CockroachDB)']
        ]),
        MORE('sky', 'Rendezvous hashing in one paragraph', [
          'For a key, compute `score = hash(key, server)` for **every** server and pick the highest. When a server leaves, only its keys move (each to its second-best server). When one joins, it wins only the keys where it now scores highest. No ring and no vnodes, but O(N) per lookup.'
        ]),
        MORE('sky', 'Jump consistent hash in one paragraph', [
          'Lamping and Veach (Google, 2014): a ~5-line function `jump(key, num_buckets)` that maps a 64-bit key to bucket 0…n−1 with perfect balance and no memory. Growing from n to n+1 buckets moves exactly 1/(n+1) of keys. Limitation: buckets are numbered, so you can only add or remove at the end, which makes it a poor fit for random server failures.'
        ], 'detail'),
        NOTE('mint', 'Rule of thumb: **ring + vnodes** for dynamic clusters, **rendezvous** for small server sets, **jump hash** for fixed numbered shards, **Maglev** for packet-level load balancing, **ranges** when you need ordered scans.'),
        UL(['Rendezvous: highest hash(key, server) wins, O(N), no ring', 'Jump hash: O(1) memory, perfect balance, only add/remove at the end', 'Maglev: O(1) lookup table for load balancers'], 'brief')
      ],
      draw(k) {
        title(k, 'Same goal, different trade-offs');
        const cards = [
          [110, 180, C.teal, 'Ring + vnodes', 'binary search on a ring\nany server can join/leave\ncaches, Cassandra, Dynamo\n\nlookup O(log(N·V))'],
          [830, 180, C.amber, 'Rendezvous (HRW)', 'score every server:\nhash(key, server) → max\nsmall clusters, simple\n\nlookup O(N)'],
          [110, 640, C.violet, 'Jump consistent hash', 'no memory, perfect balance\nadd/remove only the last\nnumbered storage shards\n\nlookup O(log N)'],
          [830, 640, C.sky, 'Maglev', 'fixed lookup table\nnear-perfect balance\npacket load balancers\n\nlookup O(1)']
        ];
        cards.forEach(([x, y, t, h, body]) => {
          k.rect(x, y, 660, 400, { stroke: t.stroke, fill: t.fill });
          k.text(x + 330, y + 30, h, { size: 38, align: 'center', color: t.stroke });
          k.text(x + 330, y + 110, body, { size: 32, align: 'center' });
        });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: "Where it's used",
      body: [
        P('Consistent hashing shows up wherever many machines share data or traffic and machines come and go:'),
        TABLE(['System', 'How it uses consistent hashing'], [
          ['**Amazon Dynamo / DynamoDB**', 'Partitions items over storage nodes on a ring; preference lists for replication'],
          ['**Apache Cassandra / ScyllaDB**', 'Token ring with vnodes; replicas are the next nodes on the ring (rack/DC aware)'],
          ['**Memcached clients (ketama)**', 'The client library picks the cache server; no central router'],
          ['**Nginx, Envoy, HAProxy**', '`hash … consistent` / ring-hash / Maglev load balancing keeps a user on the same backend'],
          ['**Akamai and other CDNs**', 'Decide which edge server caches which URL'],
          ['**Discord, chat and gaming backends**', 'Route all events for one channel/room/user to the same process']
        ]),
        NOTE('red', 'Interview trap: **Redis Cluster does not use a hash ring.** It uses **16,384 fixed hash slots** (`CRC16(key) mod 16384`) assigned to nodes, and moves whole slots when the cluster changes. Same goal, different mechanism.'),
        P('Where the ring lives: **in the client library** (ketama, Cassandra drivers that are token-aware), **in a proxy** in front of the caches (twemproxy, mcrouter, Envoy), or **inside the database** itself (Cassandra, Dynamo).', 'detail'),
        UL(['Dynamo/DynamoDB, Cassandra, memcached clients, Nginx/Envoy/HAProxy, CDNs', 'Redis Cluster uses 16,384 hash slots instead (common trap)'], 'brief')
      ],
      draw(k) {
        title(k, 'A cache tier with a consistent-hash router');
        [0, 1, 2].forEach(i => k.box(120, 260 + i * 170, 240, 110, `client ${i + 1}`, { tone: C.slate, size: 30 }));
        k.box(520, 360, 340, 260, 'router\n(client library\nor proxy)\nholds the ring', { tone: C.amber, size: 30 });
        [0, 1, 2].forEach(i => k.arrow([[365, 315 + i * 170], [515, 490]], { stroke: C.slate.stroke }));
        const caches = ['cache A', 'cache B', 'cache C', 'cache D'];
        caches.forEach((c, i) => {
          k.box(1020, 200 + i * 150, 260, 100, c, { tone: C.teal, size: 30 });
          k.arrow([[865, 490], [1015, 250 + i * 150]], { stroke: C.teal.stroke });
        });
        k.ellipse(1430, 470, 90, 30, { stroke: C.violet.stroke, fill: C.violet.fill });
        k.rect(1340, 470, 180, 160, { stroke: C.violet.stroke, fill: C.violet.fill, round: false });
        k.ellipse(1430, 630, 90, 30, { stroke: C.violet.stroke, fill: C.violet.fill });
        k.text(1430, 520, 'database', { size: 28, align: 'center' });
        k.arrow([[1285, 500], [1335, 540]], { stroke: C.violet.stroke, dashed: true });
        k.text(1290, 690, 'on a miss', { size: 24, color: C.muted });
        k.box(120, 900, 1400, 110, 'Same idea inside Dynamo, Cassandra, memcached clients, Nginx/Envoy, CDNs', { tone: C.sky, size: 30 });
        k.box(120, 1040, 1400, 110, 'Not Redis Cluster: 16,384 fixed hash slots (CRC16(key) mod 16384)', { tone: C.rose, size: 30 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Interview cheat sheet',
      body: [
        P('Explain it in this order and you cover what interviewers look for:'),
        OL([
          '**Problem:** `hash % N` remaps ~N/(N+1) of keys when N changes → cache stampede.',
          '**Ring:** hash servers and keys onto the same circle (0…2³²−1, wraps around).',
          '**Lookup:** first server clockwise; in code, a sorted array + binary search, O(log(N·V)).',
          '**Changes:** add/remove moves only ~K/N keys, from/to the neighbours.',
          '**Virtual nodes:** 100–256 positions per server for even load, smooth scaling and weights.',
          '**Replication:** next R−1 distinct physical servers (rack/zone aware); R + W > N for consistency.',
          '**Hot keys:** balanced keys ≠ balanced traffic → bounded loads, key splitting, local caches.',
          '**Alternatives:** rendezvous, jump hash, Maglev, range sharding (and Redis Cluster\'s slots).'
        ]),
        MORE('mint', 'The 60-second answer', [
          '"Plain modulo hashing reshuffles almost every key when a server is added or removed. Consistent hashing puts servers and keys on the same hash ring and gives each key to the next server clockwise, so a change only moves the keys in one arc, about K/N of them. Real systems give each server many virtual nodes to even out load and spread the impact of failures, replicate each key to the next few distinct servers, and handle hot keys separately because the ring balances keys, not traffic. Dynamo, Cassandra and memcached clients all work this way."'
        ]),
        TABLE(['Question you may get', 'Short answer'], [
          ['How many keys move when a node joins?', '~K/N (its fair share), taken from its ring neighbours (from all nodes with vnodes)'],
          ['Why virtual nodes?', 'Even load, smooth scaling, failure spread, weights'],
          ['How do you find the owner fast?', 'Sorted token array + binary search; rebuild on membership change'],
          ['How do replicas work?', 'Next distinct physical nodes clockwise; quorum R + W > N'],
          ['One key is extremely hot. Now what?', 'Bounded loads, split the key, cache it near clients'],
          ['Does Redis Cluster use this?', 'No: 16,384 hash slots']
        ], 'detail'),
        UL(['Modulo → ring → clockwise owner → K/N moves → vnodes → replicas → hot keys → alternatives'], 'brief')
      ],
      draw(k) {
        title(k, 'Consistent hashing on one page');
        const cards = [
          [C.rose, 'Problem', 'hash % N moves\n~N/(N+1) of keys'],
          [C.teal, 'Ring', 'servers + keys on\none circle'],
          [C.amber, 'Lookup', 'first server clockwise\nO(log(N·V))'],
          [C.green, 'Changes', 'only ~K/N keys move'],
          [C.violet, 'Virtual nodes', 'even load, weights,\nsmooth scaling'],
          [C.sky, 'Replicas', 'next distinct servers\nR + W > N']
        ];
        cards.forEach(([t, h, b], i) => {
          const x = 110 + (i % 3) * 470, y = 200 + Math.floor(i / 3) * 420;
          k.rect(x, y, 430, 360, { stroke: t.stroke, fill: t.fill });
          k.text(x + 50, y + 30, String(i + 1), { size: 44, align: 'center', color: t.stroke });
          k.text(x + 215, y + 40, h, { size: 36, align: 'center', color: t.stroke });
          k.text(x + 215, y + 150, b, { size: 34, align: 'center' });
        });
        k.text(800, 1060, 'Hot keys: balanced keys ≠ balanced traffic', { size: 32, align: 'center', color: C.rose.stroke });
      }
    }
  ]
};
