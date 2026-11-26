// Sample article: "Consistent Hashing" (complete system-design write-up with one slide per section).
// Used by scripts/build-seed.mjs and scripts/db-refresh-samples.mjs. Layout 40:60 → slides are 1600 × 1200.
// Writing rule for this article: one idea per paragraph, and every section has an "In the drawing" paragraph that
// walks through its split's drawing using the same names and numbers as the drawing.
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
        P('Imagine you run **N cache servers** in front of a database. For every key you must decide which server stores it.'),
        P('The obvious rule is `server = hash(key) % N`. It is fast, needs no shared state, and every client computes the same answer.'),
        H3('The problem: N changes'),
        P('The rule works until **N changes**. You add a server because traffic grew, or you lose one because it crashed.'),
        P('Suddenly almost every key maps to a different server. The caches are effectively empty, every request falls through to the database at the same moment, and the database can fall over. This is called a **cache stampede**.'),
        H3('In the drawing'),
        P('The drawing takes 8 keys, **k1 to k8**, whose hashes are 10 to 17. The `% 3` column shows their server with 3 servers (S0–S2), and the `% 4` column shows it after adding a fourth server (S3).'),
        P('The red rows are the keys that changed server: **5 of the 8 keys moved**, even though we only added one server.'),
        NOTE('red', 'With `% N`, going from N to N+1 servers moves about **N/(N+1)** of all keys: 75% when growing from 3 to 4 servers, and 99% when growing from 100 to 101.'),
        TABLE(['Servers (before → after)', 'Keys moved with `% N`', 'Keys moved with consistent hashing'], [
          ['3 → 4', '75%', '25%'],
          ['10 → 11', '91%', '9%'],
          ['100 → 101', '99%', '1%']
        ]),
        MORE('sky', 'Why does modulo move N/(N+1) of the keys?', [
          'A key stays on the same server only if `h % N == h % (N+1)`.',
          'For uniformly random hashes that happens for N out of every N·(N+1) values, so with probability **1/(N+1)**. The fraction that moves is therefore **1 − 1/(N+1) = N/(N+1)**.'
        ]),
        H3('What we want instead'),
        P('When a server joins or leaves, **only the keys that must move should move**. That is about **K/N** keys (K keys, N servers): exactly the new server\'s fair share, shown in the green box in the drawing.'),
        P('Consistent hashing guarantees this. It was introduced by Karger et al. at MIT in 1997 for web caching, and became the basis of Akamai\'s CDN.')
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
        P('Consistent hashing starts with one simple picture: the **hash ring**.'),
        H3('Bend the hash space into a circle'),
        P('Take the output range of a hash function, for example **0 to 2³²−1**, and bend it into a circle. After the largest value comes 0 again.'),
        P('To keep numbers readable, the drawing shows positions as **fractions of the ring**: 0 at the top, then 1/4, 1/2 and 3/4 going clockwise.'),
        H3('Put servers and keys on the same ring'),
        P('Now hash **servers and keys with the same function**, so both land somewhere on the ring.'),
        UL([
          'A **server\'s** position is the hash of its name or IP address.',
          'A **key\'s** position is the hash of the key itself.'
        ]),
        H3('In the drawing'),
        P('Server **cache-A** hashes to **0.21**, so it sits a little before the 1/4 mark. Key **user:42** hashes to **0.63**, a little after the halfway point.'),
        P('Both use the same hash function, which is why they can be compared on the same circle.'),
        NOTE('mint', 'The ring is only a picture. In code it is a **sorted list of numbers** that wraps around at the end.'),
        MORE('sky', 'Which hash function should you use?', [
          'It must spread values **uniformly**, and give the **same result on every machine and in every language**, because all clients must agree.',
          'Common choices are **MurmurHash3** or **xxHash** (fast, not cryptographic), or the first bytes of **MD5** (used by the classic memcached *ketama* library).',
          'Never use a language\'s built-in `hashCode()` or `hash()`: it can differ between processes, versions or platforms.'
        ])
      ],
      draw(k) {
        title(k, 'Bend the hash space into a ring');
        const cx = 600, cy = 650, r = 380;
        ring(k, cx, cy, r, { ticks: true });
        k.arc(cx, cy, r + 95, 20, 60, { stroke: C.teal.stroke, sw: 4, arrow: true });
        const [lx, ly] = polar(cx, cy, r + 150, 40);
        k.text(lx, ly - 18, 'clockwise', { size: 28, color: C.teal.stroke, align: 'center' });
        k.node(cx, cy, r, 0.21 * 360, 'cache-A', { tone: C.teal, dot: 26, labelGap: -105 });
        k.key(cx, cy, r, 0.63 * 360, 'user:42', { tone: C.amber, size: 28, dot: 14, labelGap: -80 });
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
        P('Once servers and keys are on the ring, finding a key\'s server takes one rule: **walk clockwise**.'),
        H3('The rule'),
        OL([
          'Hash the key to get its position `p`.',
          'Find the first server whose position is **≥ p**.',
          'If there is none, **wrap around** to the first server on the ring.'
        ]),
        P('That server owns the key. Put differently, every server owns the **arc between the previous server and itself**.'),
        H3('In the drawing'),
        P('Servers **A**, **B** and **C** each colour the arc they own: A owns (C, A], B owns (A, B] and C owns (B, C].'),
        P('Key **k3** sits between B and C. Walking clockwise from k3, the first server we reach is C, so **C owns k3** (the dashed arrow).'),
        P('Keys **k4** and **k5** sit after C. Walking clockwise passes the top of the ring (0) and reaches **A**: that is the wrap-around in step 3.'),
        NOTE('mint', 'Every client that knows the same server list computes the same answer **without asking anyone**. No central router is needed.'),
        P('This is why memcached client libraries could shard data on their own: each client simply carries the ring.')
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
        k.arc(cx, cy, r - 95, 304, 386, { stroke: C.teal.stroke, sw: 3, dashed: true, arrow: true });
        const [wx, wy] = polar(cx, cy, r - 170, 340);
        k.text(wx, wy - 16, 'wraps past 0', { size: 26, align: 'center', color: C.teal.stroke });
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
        P('This is where consistent hashing pays off: a change in servers only affects **one arc** of the ring.'),
        H3('Adding a server'),
        P('When a new server **D** lands between A and B, it takes over only the keys between A and D. Those keys used to belong to B.'),
        P('Every other key stays exactly where it was.'),
        H3('Removing a server'),
        P('When a server leaves or crashes, its keys move to the **next server clockwise**. Again, no other key moves.'),
        H3('In the drawing'),
        P('On the left are servers A, B and C with keys k1, k2 and k3. On the right, **D (new)** has been added between A and B.'),
        P('Only **k1** falls in D\'s new arc, so only k1 moves from B to D. Keys k2 and k3 stay where they were.'),
        P('If D is removed again, k1 goes back to B, the next server clockwise.'),
        NOTE('mint', 'On average only **K/N keys move** (K keys, N servers). That is the minimum possible: the new server has to get its fair share from somewhere.'),
        P('**The catch:** a new server relieves only **one** neighbour, and a removed server dumps its whole load on **one** neighbour. With few servers that is very uneven. Virtual nodes, in the next section, fix it.'),
        MORE('sky', 'Worked example: 4 servers, 1 million keys, add a 5th', [
          '**Modulo:** about 800,000 keys move (4/5 of them), and the cache hit rate collapses.',
          '**Ring:** about 200,000 keys move (1/5), all taken from one neighbour.',
          '**Ring with virtual nodes:** still about 200,000 keys, but about 50,000 come from each of the four old servers, so the load stays even.'
        ])
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
        P('With only one position per server, the ring is rarely fair. **Virtual nodes** are the standard fix.'),
        H3('The problem: uneven arcs'),
        P('Servers land at random positions, so the arcs between them have very different lengths. One unlucky server can own half the ring.'),
        H3('The fix: many positions per server'),
        P('Give each physical server **many** positions on the ring, for example `hash("A#1")`, `hash("A#2")` … `hash("A#200")`. Each position is a **virtual node** (vnode).'),
        P('Many small arcs average out, so every server ends up with close to its fair share of keys.'),
        H3('In the drawing'),
        P('**Left:** with one position each, A owns the long teal arc, which is **69%** of the keys. B gets only 14% and C 17%.'),
        P('**Right:** each server has **3 virtual nodes** (A1–A3, B1–B3, C1–C3) spread around the ring, and each server gets about **33%**.'),
        H3('Why it matters'),
        UL([
          '**Even load:** the spread between servers shrinks roughly like 1/√V, where V is the number of vnodes per server.',
          '**Smooth scaling:** a new server takes a small slice from **every** other server, not just from one neighbour.',
          '**Graceful failure:** a failed server\'s load spreads over all the survivors.',
          '**Different machine sizes:** a bigger machine simply gets more vnodes (weighting).'
        ]),
        MORE('sky', 'How uneven is it without virtual nodes?', [
          'With one random position per server, the largest arc is about **(ln N)/N** of the ring, roughly ln N times the fair share. With 10 servers, the busiest one typically gets more than twice the average load.',
          'With 100–200 vnodes per server, the busiest server is usually within about 10% of the average.'
        ]),
        P('The cost is small: the lookup table grows to N × V entries (100 servers × 200 vnodes = 20,000 numbers), and rebalancing moves many small ranges instead of one big one.'),
        P('Cassandra used 256 vnodes per node for years, then lowered the default to 16 together with a smarter token-allocation algorithm.')
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
        P('In code there is no circle. The ring is just a **sorted array of positions** (called *tokens*), each pointing to the server that owns it.'),
        H3('How a lookup works'),
        OL([
          'Hash the key.',
          'Binary-search the sorted tokens for the **first token ≥ the hash**.',
          'If the hash is larger than every token, **wrap around** to index 0.'
        ]),
        H3('In the drawing'),
        P('The top row is the sorted token array: 12 (A), 87 (C), 140 (B), 201 (A), 255 (B) and 310 (C).'),
        P('A key that hashes to **150** finds 201 as the first token ≥ 150, so it belongs to **A**.'),
        P('A key that hashes to **330** is past the last token, so the search wraps to index 0, token 12, which is also **A** (the dashed red arrow).'),
        H3('The code'),
        P('Here is a complete ring with virtual nodes in Python. `add()` inserts a server\'s vnodes, `remove()` takes them out, and `get()` is the lookup described above.'),
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
        H3('Cost'),
        P('The blue box at the bottom of the drawing sums up the cost of each operation:'),
        TABLE(['Operation', 'Cost', 'Notes'], [
          ['Lookup', '`O(log(N·V))`', 'Binary search over N servers × V vnodes'],
          ['Add / remove a server', '`O(V · log(N·V))`', 'Plus moving ~K/N keys of data'],
          ['Memory', '`O(N·V)`', '100 servers × 200 vnodes = 20,000 entries']
        ]),
        MORE('sky', 'Production notes', [
          '**Rebuild, don\'t mutate.** Build a new sorted array on each membership change and swap it in atomically, so lookups never take a lock.',
          '**Agree on membership.** The server list comes from a coordination service (ZooKeeper, etcd, Consul) or a gossip protocol (Cassandra, Dynamo). Clients with different lists disagree about owners.',
          '**Token collisions** between two servers are astronomically rare with 64-bit hashes. Break ties by server id if you want to be strict.'
        ])
      ],
      draw(k) {
        title(k, 'The ring in memory: a sorted array');
        const toks = [[12, 'A', C.teal], [87, 'C', C.violet], [140, 'B', C.amber], [201, 'A', C.teal], [255, 'B', C.amber], [310, 'C', C.violet]];
        const x0 = 110, y = 300, w = 220, gap = 10;
        k.text(x0, 240, 'tokens (sorted) → owner', { size: 28, color: C.muted });
        toks.forEach(([t, s, tone], i) => k.box(x0 + i * (w + gap), y, w, 120, `${t}\n${s}`, { tone, size: 34 }));
        const bx = x0 + 3 * (w + gap);
        k.box(560, 560, 520, 110, 'hash(key) = 150', { tone: C.slate, size: 32 });
        k.arrow([[900, 560], [bx + w / 2, y + 128]], { stroke: C.teal.stroke, sw: 3 });
        k.text(1180, 500, 'binary search:\nfirst token ≥ 150\n→ 201 (A)', { size: 28, color: C.teal.stroke });
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
        P('Servers fail, so important data is stored on **more than one server**. The ring tells us which ones.'),
        H3('The preference list'),
        P('With a replication factor of 3, a key lives on its **owner** plus the **next 2 distinct physical servers** clockwise. Amazon\'s Dynamo calls this list the key\'s **preference list**.'),
        P('With virtual nodes you must **skip positions that belong to a server already in the list**. Otherwise two "replicas" could end up on the same machine, and one crash would lose both.'),
        H3('In the drawing'),
        P('Key **k** sits between A and B. Walking clockwise, the arrows mark the replicas in order: **1 = B** (the owner), **2 = C** and **3 = D**. Its preference list is B → C → D.'),
        P('The red box shows what happens when **C is down**: the write goes to the next healthy server, **E**, which keeps it with a *hint* and hands it back when C returns.'),
        NOTE('red', 'Replication factor 3 survives losing any 2 of the 3 servers, but only if they are really different machines, ideally in different racks or availability zones.'),
        H3('Quorums'),
        P('With **N** replicas, a write waits for **W** acknowledgements and a read asks **R** replicas.'),
        P('If **R + W > N**, every read overlaps the latest write, so reads see the newest value. The drawing uses N = 3, W = 2, R = 2. Lowering W or R trades consistency for speed and availability.'),
        MORE('sky', 'Sloppy quorum, hinted handoff and zones', [
          'Writing to the next healthy server while a replica is down is called a **sloppy quorum**. Handing the data back later is **hinted handoff**. Together they keep writes succeeding during short outages.',
          'Rack and zone awareness (e.g. Cassandra\'s NetworkTopologyStrategy) keeps walking the ring until the replicas are in different racks or zones.'
        ])
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
        P('Consistent hashing balances **keys**, not **traffic**. One very popular key, such as a celebrity\'s profile or a viral post, still lives on one server and can overload it.'),
        P('There are four common fixes. The drawing shows them in the same order as below.'),
        H3('1. Bounded loads'),
        P('Cap every server at **(1+ε) × the average load**. If a key\'s owner is already full, keep walking clockwise to the next server that has room.'),
        P('**In the drawing:** server **B** has reached the dashed **cap** line, so the next key goes on to **C**.'),
        H3('2. Hot-key splitting'),
        P('Store the hot key as several copies, `key#1 … key#k`, on different servers, and read a random copy.'),
        P('**In the drawing:** `celebrity:1` is split into **#1, #2 and #3** on three servers, which share its reads.'),
        H3('3. Weights'),
        P('Give bigger machines more vnodes, so they own a bigger share of the ring (the blue box).'),
        H3('4. Near cache'),
        P('Keep the hottest keys in the client or proxy memory for a few seconds, so most reads never reach the server (the green box).'),
        TABLE(['Technique', 'Helps with', 'Trade-off'], [
          ['Bounded loads', 'Any overloaded server', 'A few keys move as load shifts'],
          ['Hot-key splitting', 'One extremely hot key', 'Every write must update all copies'],
          ['Weights', 'Machines of different sizes', 'Static: doesn\'t react to traffic'],
          ['Near cache', 'Read-heavy hot keys', 'Slightly stale reads']
        ]),
        MORE('sky', 'Where bounded loads come from', [
          'Proposed by Mirrokni, Thorup and Zadimoghaddam (Google, 2017). Each server accepts at most ⌈(1+ε) · average⌉ requests.',
          'It keeps most of consistent hashing\'s stability while guaranteeing that no server is overloaded. Vimeo used it for video caching, and HAProxy supports it as `hash-balance-factor`.'
        ])
      ],
      draw(k) {
        title(k, 'Balanced keys ≠ balanced traffic');
        const base = 760, cap = 330;
        k.text(110, 170, '1. Bounded loads: cap = (1+ε) × average', { size: 30 });
        [[160, 'A', 300, C.teal], [400, 'B', 330, C.amber], [640, 'C', 150, C.violet]].forEach(([x, l, h, t]) => {
          k.rect(x, base - h, 160, h, { stroke: t.stroke, fill: t.fill });
          k.text(x + 80, base + 12, l, { size: 30, align: 'center' });
        });
        k.line([[120, base - cap], [860, base - cap]], { stroke: C.rose.stroke, sw: 3, dashed: true });
        k.text(870, base - cap - 18, 'cap', { size: 28, color: C.rose.stroke });
        k.arrow([[540, base - cap - 20], [640, base - cap - 60], [720, base - 170]], { stroke: C.rose.stroke, sw: 3 });
        k.text(300, base - cap - 140, 'B is full → the next key\ngoes on to C', { size: 26, color: C.rose.stroke });
        k.text(1000, 170, '2. Hot-key splitting', { size: 30 });
        k.box(1080, 240, 380, 100, '"celebrity:1"', { tone: C.rose, size: 30 });
        [['#1', 1000], ['#2', 1190], ['#3', 1380]].forEach(([l, x]) => {
          k.arrow([[1270, 345], [x + 70, 470]], { stroke: C.rose.stroke, sw: 2 });
          k.box(x, 480, 140, 90, l, { tone: C.slate, size: 28 });
        });
        k.text(1230, 600, 'copies on 3 servers,\nread a random one', { size: 26, align: 'center', color: C.muted });
        k.box(110, 900, 1380, 100, '3. Weights: bigger machine → more vnodes → bigger share of the ring', { tone: C.sky, size: 30 });
        k.box(110, 1030, 1380, 100, '4. Near cache: keep the hottest keys in client/proxy memory for a few seconds', { tone: C.green, size: 30 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Alternatives',
      body: [
        P('The ring with virtual nodes is not the only way to move few keys when servers change. Each card in the drawing is one alternative, in the same order as below.'),
        H3('Ring + virtual nodes'),
        P('Everything described so far: binary search on a ring, and any server can join or leave at any time. It is the default for caches and storage clusters (Cassandra, Dynamo).'),
        H3('Rendezvous hashing (HRW)'),
        P('For each key, compute `score = hash(key, server)` for **every** server and pick the highest. There is no ring and there are no vnodes.'),
        P('When a server leaves, only its keys move, each to its second-best server. Lookups cost O(N), so it suits small server sets.'),
        H3('Jump consistent hash'),
        P('A five-line function from Google (2014) that maps a key to bucket 0…n−1 with **perfect balance and no memory**.'),
        P('Its limitation: buckets are numbered, so you can only add or remove the **last** one. That fits numbered storage shards, not random server failures.'),
        H3('Maglev hashing'),
        P('Google\'s load balancer builds a **fixed-size lookup table** (for example 65,537 entries) for O(1) lookups with near-perfect balance. It is made for routing network packets, where speed matters most.'),
        H3('Range sharding'),
        P('Instead of hashing, split the key space into **ordered ranges** and move whole ranges between servers. Keys stay sorted, so range scans are fast. Bigtable, HBase and CockroachDB work this way.'),
        H3('Side by side'),
        TABLE(['Approach', 'Lookup', 'Memory', 'Balance', 'Membership changes', 'Best for'], [
          ['Ring + vnodes', '`O(log(N·V))`', '`O(N·V)`', 'Good (more vnodes = better)', 'Any server, any time', 'Caches and storage clusters'],
          ['Rendezvous (HRW)', '`O(N)`', '`O(N)`', 'Excellent', 'Any server, any time', 'Small server sets (up to ~100)'],
          ['Jump consistent hash', '`O(log N)`', '`O(1)`', 'Perfect', 'Only the last bucket', 'Numbered storage shards'],
          ['Maglev', '`O(1)`', 'Fixed table', 'Near perfect', 'Any; a few % of keys move', 'Packet load balancers'],
          ['Range sharding', '`O(log S)` (metadata)', 'Range table', 'Managed by splits', 'Move ranges explicitly', 'Ordered keys and range scans']
        ]),
        NOTE('mint', 'Rule of thumb: **ring + vnodes** for dynamic clusters, **rendezvous** for small server sets, **jump hash** for fixed numbered shards, **Maglev** for packet load balancing, and **ranges** when you need ordered scans.')
      ],
      draw(k) {
        title(k, 'Same goal, different trade-offs');
        const cards = [
          [C.teal, 'Ring + vnodes', 'binary search on a ring\nany server can join/leave\nlookup O(log(N·V))'],
          [C.amber, 'Rendezvous (HRW)', 'hash(key, server) → max\nno ring, small clusters\nlookup O(N)'],
          [C.violet, 'Jump consistent hash', 'no memory, perfect balance\nadd/remove only the last\nlookup O(log N)'],
          [C.sky, 'Maglev', 'fixed lookup table\nnear-perfect balance\nlookup O(1)'],
          [C.green, 'Range sharding', 'ordered key ranges\nmove whole ranges\nfast range scans']
        ];
        cards.forEach(([t, h, body], i) => {
          const row = i < 3 ? 0 : 1, col = row === 0 ? i : i - 3;
          const x = row === 0 ? 70 + col * 500 : 320 + col * 500, y = row === 0 ? 180 : 650;
          k.rect(x, y, 460, 420, { stroke: t.stroke, fill: t.fill });
          k.text(x + 230, y + 30, h, { size: 34, align: 'center', color: t.stroke });
          k.text(x + 230, y + 130, body, { size: 29, align: 'center' });
        });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: "Where it's used",
      body: [
        P('Consistent hashing shows up wherever many machines share data or traffic, and machines come and go.'),
        H3('In the drawing: a cache tier'),
        P('Three **clients** send requests to a **router**. The router is either a client library or a proxy, and it holds the ring.'),
        P('For each key, the router uses the ring to pick one of the caches, **A to D**. On a miss, that cache reads from the **database** and keeps the result.'),
        P('When a cache is added or removed, only the keys in one arc change cache, so the database never sees a stampede.'),
        H3('Real systems'),
        TABLE(['System', 'How it uses consistent hashing'], [
          ['Amazon Dynamo / DynamoDB', 'Partitions items over storage nodes on a ring; preference lists for replication'],
          ['Apache Cassandra / ScyllaDB', 'Token ring with vnodes; replicas are the next nodes on the ring (rack and data-centre aware)'],
          ['Memcached clients (ketama)', 'The client library picks the cache server; no central router'],
          ['Nginx, Envoy, HAProxy', '`hash … consistent`, ring-hash or Maglev load balancing keeps a user on the same backend'],
          ['Akamai and other CDNs', 'Decide which edge server caches which URL'],
          ['Chat and gaming backends (e.g. Discord)', 'Route all events of one channel, room or user to the same process']
        ]),
        NOTE('red', 'Interview trap: **Redis Cluster does not use a hash ring.** It uses **16,384 fixed hash slots** (`CRC16(key) mod 16384`) assigned to nodes, and moves whole slots when the cluster changes. Same goal, different mechanism.'),
        P('Where the ring lives varies: **in the client library** (ketama, token-aware Cassandra drivers), **in a proxy** in front of the caches (twemproxy, mcrouter, Envoy), or **inside the database** itself (Cassandra, Dynamo).')
      ],
      draw(k) {
        title(k, 'A cache tier with a consistent-hash router');
        [0, 1, 2].forEach(i => k.box(120, 260 + i * 170, 240, 110, `client ${i + 1}`, { tone: C.slate, size: 30 }));
        k.box(520, 360, 340, 260, 'router\n(client library\nor proxy)\nholds the ring', { tone: C.amber, size: 30 });
        [0, 1, 2].forEach(i => k.arrow([[365, 315 + i * 170], [515, 490]], { stroke: C.slate.stroke }));
        ['cache A', 'cache B', 'cache C', 'cache D'].forEach((c, i) => {
          k.box(1020, 200 + i * 150, 260, 100, c, { tone: C.teal, size: 30 });
          k.arrow([[865, 490], [1015, 250 + i * 150]], { stroke: C.teal.stroke });
        });
        k.rect(1340, 470, 180, 160, { stroke: C.violet.stroke, fill: C.violet.fill, round: false });
        k.ellipse(1430, 470, 90, 30, { stroke: C.violet.stroke, fill: C.violet.fill });
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
        P('In an interview, explain consistent hashing in these **eight steps**. Each card in the drawing is one step.'),
        OL([
          '**Problem:** `hash % N` remaps ~N/(N+1) of keys when N changes, causing a cache stampede.',
          '**Ring:** hash servers and keys onto the same circle (0…2³²−1, wrapping around).',
          '**Lookup:** the first server clockwise; in code, a sorted array plus binary search, O(log(N·V)).',
          '**Changes:** adding or removing a server moves only ~K/N keys, from or to its neighbours.',
          '**Virtual nodes:** 100–256 positions per server for even load, smooth scaling and weights.',
          '**Replication:** the next R−1 distinct physical servers (rack and zone aware); R + W > N for consistency.',
          '**Hot keys:** balanced keys ≠ balanced traffic, so use bounded loads, key splitting and local caches.',
          '**Alternatives:** rendezvous, jump hash, Maglev and range sharding (and Redis Cluster\'s slots).'
        ]),
        MORE('mint', 'The 60-second answer', [
          '"Plain modulo hashing reshuffles almost every key when a server is added or removed.',
          'Consistent hashing puts servers and keys on the same hash ring and gives each key to the next server clockwise, so a change only moves the keys in one arc, about K/N of them.',
          'Real systems give each server many virtual nodes to even out the load, replicate each key to the next few distinct servers, and handle hot keys separately, because the ring balances keys, not traffic. Dynamo, Cassandra and memcached clients all work this way."'
        ]),
        H3('Questions you may get'),
        TABLE(['Question', 'Short answer'], [
          ['How many keys move when a node joins?', '~K/N (its fair share), from its ring neighbours, or from all nodes with vnodes'],
          ['Why virtual nodes?', 'Even load, smooth scaling, failure spread, weights'],
          ['How do you find the owner fast?', 'Sorted token array + binary search; rebuild on membership change'],
          ['How do replicas work?', 'Next distinct physical nodes clockwise; quorum R + W > N'],
          ['One key is extremely hot. Now what?', 'Bounded loads, split the key, cache it near clients'],
          ['Does Redis Cluster use this?', 'No: 16,384 hash slots']
        ])
      ],
      draw(k) {
        title(k, 'Consistent hashing in 8 steps');
        const cards = [
          [C.rose, 'Problem', 'hash % N moves\n~N/(N+1) of keys'],
          [C.teal, 'Ring', 'servers + keys\non one circle'],
          [C.amber, 'Lookup', 'first server clockwise\nO(log(N·V))'],
          [C.green, 'Changes', 'only ~K/N keys\nmove'],
          [C.violet, 'Virtual nodes', 'even load, weights,\nsmooth scaling'],
          [C.sky, 'Replication', 'next distinct servers\nR + W > N'],
          [C.rose, 'Hot keys', 'keys ≠ traffic:\nbounded loads, split'],
          [C.slate, 'Alternatives', 'rendezvous, jump,\nMaglev, ranges']
        ];
        cards.forEach(([t, h, b], i) => {
          const x = 70 + (i % 4) * 370, y = 190 + Math.floor(i / 4) * 470;
          k.rect(x, y, 340, 420, { stroke: t.stroke, fill: t.fill });
          k.text(x + 40, y + 24, String(i + 1), { size: 44, align: 'center', color: t.stroke });
          k.text(x + 170, y + 100, h, { size: 34, align: 'center', color: t.stroke });
          k.text(x + 170, y + 210, b, { size: 28, align: 'center' });
        });
      }
    }
  ]
};
