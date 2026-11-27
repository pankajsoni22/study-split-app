// Sample article: "A Distributed ETL Pipeline for Storage Telemetry" (high-level design of a real project, told as
// one file's journey). Used by scripts/build-seed.mjs and scripts/db-refresh-samples.mjs. Layout 40:60 → slides are
// 1600 × 1200. Unfold is on: every drawing builds up with the paragraph that explains it (k.step(prefix)).
// Writing rule: short paragraphs, one idea each, plain words first and the technical name second.
import { C, MORE, NOTE, OL, P, TABLE } from './draw.mjs';

const W = 1600;
const title = (k, t, sub) => {
  k.text(W / 2, 40, t, { size: 46, align: 'center' });
  if (sub) k.text(W / 2, 104, sub, { size: 26, align: 'center', color: C.muted });
};
/** A database cylinder with a centred label. */
function db(k, x, y, w, h, label, tone = C.sky, size = 28) {
  k.ellipse(x + w / 2, y + h, w / 2, 22, { stroke: tone.stroke, fill: tone.fill });
  k.rect(x, y, w, h, { stroke: tone.stroke, fill: tone.fill, round: false });
  k.ellipse(x + w / 2, y, w / 2, 22, { stroke: tone.stroke, fill: tone.fill });
  const n = label.split('\n').length;
  k.text(x + w / 2, y + h / 2 - (n * size * 1.25) / 2 + 10, label, { size, align: 'center' });
}
const muted = { stroke: '#94a3b8', fill: '#f8fafc' };

export const telemetryEtl = {
  key: 'etl', owner: 1, slug: 'telemetry-etl-pipeline', title: 'A Distributed ETL Pipeline for Storage Telemetry', state: 'published',
  layout: '40-60', unfold: true, tags: ['system-design', 'data-engineering', 'kafka'],
  summary: 'How 10,000+ storage arrays\' telemetry files flow into PostgreSQL 24×7 without losing, duplicating or reordering a single file: ingestion, Kafka, parser workers, archival, failures, and the trade-offs behind each choice.',
  sections: [
    // ------------------------------------------------------------------------------------------------
    {
      title: 'The problem',
      body: [
        P('Thousands of storage arrays (more than **10,000**) keep writing **telemetry files** about their own health: disks, ports, performance counters. Each array has an id called `symm_id`.'),
        P('The files land on a shared network drive, the **source NAS**. On their own they are just raw files that nobody can query.'),
        P('We need a pipeline that turns every file into **rows in a database**, so that analytics apps can join and query them.'),
        P('It has to be trustworthy. Five promises shape the whole design:'),
        OL([
          '**No file is lost**, even when machines crash.',
          '**No file is loaded twice.**',
          'Files from the **same array are processed in order** (a later file can depend on an earlier one).',
          'A **corrupt file is set aside**, never allowed to block the rest.',
          'The team can **see what is happening**, 24×7.'
        ]),
        P('The load is steady rather than huge: about **500,000 files a day**, which is **~6 files per second** on average and **30–60 per second** at peak.'),
        NOTE('mint', 'The hard part is not speed. It is **correctness under failure**: crashes, retries and bad files must never lose, duplicate or reorder data.')
      ],
      draw(k) {
        title(k, 'From raw telemetry files to queryable rows');
        k.step('Thousands of storage arrays');
        ['array 0001', 'array 0002', '… 10,000+ arrays'].forEach((t, i) => k.box(70, 200 + i * 115, 300, 90, t, { tone: C.slate, size: 26 }));
        k.step('The files land on');
        db(k, 470, 250, 280, 200, 'Source NAS\nraw files', C.amber);
        [245, 360, 475].forEach(y => k.arrow([[370, y], [466, 350]], { stroke: C.muted }));
        k.step('We need a pipeline');
        k.box(860, 270, 260, 160, '?\npipeline', { tone: muted, dashed: true, size: 32 });
        k.arrow([[754, 350], [856, 350]]);
        db(k, 1230, 250, 300, 200, 'Database\nfor analytics', C.sky);
        k.arrow([[1124, 350], [1226, 350]]);
        k.step('It has to be trustworthy');
        k.text(70, 640, 'Five promises', { size: 32, bold: true });
        [['No file\nlost', C.green], ['No\nduplicates', C.sky], ['Order per\narray', C.violet], ['Bad files\nset aside', C.rose], ['Visible\n24×7', C.amber]]
          .forEach(([t, tone], i) => k.box(70 + i * 292, 700, 270, 150, t, { tone, size: 30 }));
        k.step('The load is steady');
        k.box(70, 930, 1440, 120, '~500,000 files a day  ·  ~6 per second on average  ·  30–60 per second at peak', { tone: C.slate, size: 32 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'The big picture',
      body: [
        P('Before the details, follow **one file** through the system. Every box in the drawing appears at the moment the file reaches it.'),
        P('An array drops a file on the source NAS. The **ingestion service** notices it, makes sure it has not seen it before (using **Redis**), and creates a small task message.'),
        P('The task goes into **Kafka**, a durable queue. Kafka holds the work until a worker is free, so bursts never overwhelm anyone.'),
        P('A **parser worker** takes the task, reads the file, and writes all its rows into **PostgreSQL** in one transaction.'),
        P('After the data is safe, the worker asks for the file to be archived. The **archival service** compresses it into the **archive NAS** and only then removes the original.'),
        P('If the file is corrupt, it goes to the **quarantine store** instead, with the reason, for a human to look at.'),
        P('All along the way, every service sends logs and metrics to the **observability** stack, tagged with the file\'s `task_id`.'),
        NOTE('sky', 'Notice the pattern: services never call each other directly. They **talk through Kafka topics**, so each one can slow down, crash or scale without breaking the others.')
      ],
      draw(k) {
        title(k, 'One file\'s journey');
        k.step('An array drops a file');
        k.box(60, 170, 250, 80, '10K+ arrays', { tone: C.slate, size: 26 });
        k.arrow([[185, 250], [185, 286]]);
        k.box(60, 290, 250, 100, 'Source NAS', { tone: C.amber, size: 30 });
        k.box(400, 290, 270, 100, 'Ingestion\nservice', { tone: C.teal, size: 28 });
        k.arrow([[310, 340], [396, 340]]);
        k.box(430, 450, 210, 90, 'Redis\nseen files', { tone: C.rose, size: 24 });
        k.line([[535, 390], [535, 450]], { dashed: true, stroke: C.rose.stroke });
        k.step('The task goes into');
        k.rect(760, 200, 300, 640, { stroke: C.violet.stroke, fill: '#faf5ff', sw: 3 });
        k.text(910, 215, 'Kafka', { size: 36, align: 'center', color: C.violet.stroke, bold: true });
        k.box(790, 290, 240, 100, 'task topic', { tone: C.violet, size: 26 });
        k.arrow([[670, 340], [786, 340]]);
        k.step('A parser worker takes');
        k.box(1170, 290, 330, 100, 'Parser workers\n(pool of N)', { tone: C.teal, size: 28 });
        k.arrow([[1030, 340], [1166, 340]]);
        db(k, 1190, 480, 290, 140, 'PostgreSQL', C.sky, 30);
        k.arrow([[1335, 390], [1335, 454]]);
        k.text(1350, 405, '1 transaction', { size: 22, color: C.muted });
        k.step('After the data is safe');
        k.box(790, 420, 240, 100, 'archival topic', { tone: C.violet, size: 26 });
        k.arrow([[1170, 372], [1034, 455]], { stroke: C.green.stroke });
        k.box(400, 620, 270, 100, 'Archival\nservice', { tone: C.green, size: 28 });
        k.arrow([[790, 480], [674, 640]], { stroke: C.green.stroke });
        db(k, 60, 610, 250, 120, 'Archive NAS\n(.zst)', C.green, 26);
        k.arrow([[400, 670], [314, 670]], { stroke: C.green.stroke });
        k.step('If the file is corrupt');
        k.box(790, 550, 240, 100, 'quarantine topic', { tone: C.violet, size: 26 });
        k.arrow([[1180, 390], [1034, 585]], { stroke: C.rose.stroke });
        k.box(1190, 690, 290, 110, 'Quarantine\nstore', { tone: C.rose, size: 28 });
        k.arrow([[1030, 615], [1186, 730]], { stroke: C.rose.stroke });
        k.step('All along the way');
        k.box(790, 690, 240, 100, 'logs topic', { tone: C.violet, size: 26 });
        k.box(60, 920, 1440, 130, 'Observability:  logs → Logstash → Elasticsearch → Kibana\nmetrics → Prometheus → Grafana  ·  alerts → Slack / PagerDuty', { tone: C.slate, size: 28, dashed: true });
        k.arrow([[910, 840], [910, 916]], { stroke: C.muted });
        k.text(800, 1090, 'one task_id follows the file through every box', { size: 26, align: 'center', color: C.muted });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Finding new files',
      body: [
        P('The **ingestion service** is the front door. Its only job is to notice new files and turn each one into a task, exactly once.'),
        P('Every 30 seconds it scans the NAS folders. From each file\'s name it reads the array (`symm_id`) and the time the file was made.'),
        P('Then it computes a checksum (a fingerprint of the file\'s bytes) and asks **Redis**: *have I seen this fingerprint before?* If yes, the file is skipped.'),
        P('If the file is new, it publishes a `TaskMessage` to Kafka, **keyed by `symm_id`** (the next split shows why the key matters), and marks the file as *queued* in Redis.'),
        P('If Kafka is unreachable, it simply retries later. The file stays on the NAS, and **the NAS is the source of truth**, so nothing can be lost.'),
        P('Trade-off: where should the "seen files" list live? We looked at four places:'),
        TABLE(['Option', 'Good', 'Cost'], [
          ['**Redis** (chosen)', 'Shared by all ingestion instances, sub-millisecond, entries expire on their own', 'One more cluster to run'],
          ['Move file to a `queued/` folder', 'No extra infrastructure', 'Needs rename rights on the NAS'],
          ['PostgreSQL table', 'Reuses what we already have', 'Extra reads on the busiest component'],
          ['Local SQLite', 'No network at all', 'Not shared; lost on restart']
        ]),
        P('Redis won because several ingestion instances run in parallel and must share one memory of what they have seen.'),
        P('And if Redis ever misses (say, during a failover), the database\'s own duplicate check catches it. Dedup here is an **optimisation**, not the last line of defence.')
      ],
      draw(k) {
        title(k, 'Ingestion: notice each file once');
        const step = (y, t, tone = C.teal) => k.box(60, y, 560, 110, t, { tone, size: 28 });
        k.step('Every 30 seconds');
        step(190, '1  Scan the NAS every 30 s');
        k.arrow([[340, 300], [340, 336]]);
        step(340, '2  Read symm_id + time\nfrom the file name');
        k.step('Then it computes');
        k.arrow([[340, 450], [340, 486]]);
        step(490, '3  Fingerprint seen before?\n(checksum → Redis)', C.rose);
        k.arrow([[620, 545], [676, 545]]);
        k.box(680, 500, 180, 90, 'seen:\nskip', { tone: muted, size: 26 });
        k.step('If the file is new');
        k.arrow([[340, 600], [340, 636]]);
        k.text(360, 604, 'new', { size: 24, color: C.muted });
        step(640, '4  Publish TaskMessage\nto Kafka, key = symm_id', C.violet);
        k.arrow([[340, 750], [340, 786]]);
        step(790, '5  Mark it "queued" in Redis', C.rose);
        k.step('If Kafka is unreachable');
        k.box(60, 950, 560, 130, 'Kafka down? Retry later.\nThe file waits safely on the NAS.', { tone: C.amber, size: 28 });
        k.step('Trade-off: where should');
        k.text(1210, 180, 'Where to remember "seen"?', { size: 30, align: 'center', bold: true });
        [['Redis  (chosen)\n+ shared, fast, auto-expiry\n− one more cluster', C.green],
          ['queued/ folder\n+ no extra infrastructure\n− needs NAS rename rights', C.slate],
          ['PostgreSQL table\n+ already exists\n− load on the busiest part', C.slate],
          ['Local SQLite\n+ no network\n− not shared, lost on restart', C.slate]]
          .forEach(([t, tone], i) => k.box(900, 240 + i * 170, 620, 150, t, { tone, size: 26 }));
        k.step('And if Redis ever misses');
        k.box(900, 950, 620, 130, 'Safety net: the database skips\nfiles it already loaded', { tone: C.sky, size: 28 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Kafka: order without a bottleneck',
      body: [
        P('Kafka sits between ingestion and the workers. It solves two problems at once: **ordering** and **sharing the work**.'),
        P('Kafka splits a topic into **partitions**: independent lanes. Messages inside one lane are kept in order; different lanes move in parallel.'),
        P('Every message is keyed by `symm_id`, and the same key always goes to the same partition. So **all files from one array travel in one lane, in order**, while different arrays share the other lanes.'),
        P('Parser workers form a **consumer group**: Kafka gives each partition to exactly one worker at a time. If a worker joins or dies, Kafka hands its partitions to the others automatically.'),
        P('A worker tells Kafka "done" (commits the offset) **only after the database commit**. If it crashes halfway, the same message is delivered again, so work is never lost.'),
        P('If workers fall behind, messages simply wait in Kafka. The queue absorbs bursts, and the growing **consumer lag** is the signal to add workers.'),
        NOTE('sand', '**Trade-off:** one partition is read by one worker, so the number of partitions is the ceiling on parallel workers. We created more partitions than we needed on day one, because adding them later reshuffles which array goes to which lane.'),
        MORE('sky', 'Why not one global order across all files?', [
          'Different arrays are independent; nothing in array A depends on array B.',
          'A single global order would force one worker to do everything. Ordering **per array** keeps the guarantee that matters and lets the rest run in parallel.'
        ])
      ],
      draw(k) {
        title(k, 'Partitions keep each array in order');
        const lanes = [
          ['P0', [['A1 t3', C.teal], ['A4 t1', C.amber], ['A1 t2', C.teal], ['A1 t1', C.teal]]],
          ['P1', [['A5 t1', C.sky], ['A2 t2', C.rose], ['A2 t1', C.rose]]],
          ['P2', [['A3 t3', C.violet], ['A3 t2', C.violet], ['A3 t1', C.violet]]]
        ];
        k.step('Kafka splits a topic');
        lanes.forEach(([name], i) => {
          const y = 220 + i * 190;
          k.rect(330, y, 800, 130, { stroke: C.violet.stroke, fill: '#faf5ff', dashed: true });
          k.text(360, y + 46, name, { size: 34, bold: true, color: C.violet.stroke });
        });
        k.box(60, 400, 200, 130, 'Ingestion', { tone: C.teal, size: 28 });
        lanes.forEach((_, i) => k.arrow([[260, 465], [326, 285 + i * 190]], { stroke: C.muted }));
        k.step('Every message is keyed');
        lanes.forEach(([, msgs], i) => {
          const y = 220 + i * 190;
          msgs.forEach(([t, tone], j) => k.box(1110 - (msgs.length - j) * 150, y + 30, 130, 70, t, { tone, size: 24 }));
        });
        k.text(730, 800, '← newer        older → (read first)', { size: 24, align: 'center', color: C.muted });
        k.step('Parser workers form');
        k.text(1360, 175, 'consumer group', { size: 26, align: 'center', color: C.teal.stroke });
        lanes.forEach((_, i) => {
          const y = 220 + i * 190;
          k.box(1230, y + 10, 260, 110, `Worker ${i + 1}`, { tone: C.teal, size: 28 });
          k.arrow([[1130, y + 65], [1226, y + 65]]);
        });
        k.step('A worker tells Kafka');
        k.box(60, 870, 1430, 110, 'Commit the offset only after the DB commit → a crash means redelivery, never loss', { tone: C.green, size: 28 });
        k.step('If workers fall behind');
        k.box(60, 1010, 1430, 110, 'Lag growing? Add workers, up to the number of partitions', { tone: C.amber, size: 28 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Parser workers',
      body: [
        P('The workers do the real work: turn a raw file into rows. They are **stateless**: everything they need is in Kafka (which task is next) and PostgreSQL (the data), so any worker can take over any partition.'),
        P('A worker takes a task from Kafka and fetches the file from the NAS.'),
        P('First it checks the fingerprint. If the bytes do not match what ingestion saw, the file was damaged on the way (a partial write, a bad disk): it goes straight to **quarantine**.'),
        P('Then it parses the file into typed records. A malformed file also goes to quarantine. Retrying a corrupt file would fail the same way forever and **block the whole lane**.'),
        P('All rows from the file are written to PostgreSQL in **one transaction**. If the database has a hiccup (timeout, deadlock), the worker retries up to 3 times, then gives the task to a **dead-letter queue (DLQ)**.'),
        P('Only after the commit does it publish an archival request and commit the Kafka offset. Every path, success or failure, ends with that commit, so the lane keeps moving.'),
        MORE('sky', 'Trade-off: why not a separate "DB loader" service?', [
          'Splitting parse and load would need another topic, serialising parsed data, and a harder rollback story.',
          'Inline loading keeps it **atomic, simpler and one network hop shorter**. At ~6 files per second, parsing and loading never bottleneck separately, so adding workers scales both together.',
          'A separate loader would only pay off if parsing were CPU-heavy and loading I/O-heavy with very different scaling needs.'
        ])
      ],
      draw(k) {
        title(k, 'Inside a worker: one task, every outcome');
        const main = (y, t, tone = C.teal) => k.box(200, y, 560, 95, t, { tone, size: 28 });
        const down = y => k.arrow([[480, y], [480, y + 36]]);
        k.step('A worker takes a task');
        main(150, 'Take task from Kafka', C.violet); down(245);
        main(285, 'Fetch file from NAS');
        k.step('First it checks');
        down(380);
        main(420, 'Fingerprint matches?', C.sky);
        k.box(960, 480, 500, 120, 'Quarantine\n(no retry)', { tone: C.rose, size: 30 });
        k.arrow([[760, 467], [956, 520]], { stroke: C.rose.stroke });
        k.text(830, 455, 'no', { size: 24, color: C.rose.stroke });
        k.step('Then it parses');
        down(515);
        main(555, 'Parse into records');
        k.arrow([[760, 602], [956, 565]], { stroke: C.rose.stroke });
        k.text(830, 600, 'malformed', { size: 24, color: C.rose.stroke });
        k.step('All rows from the file');
        down(650);
        main(690, 'Write all rows to PostgreSQL\n(one transaction)', C.sky);
        k.box(960, 700, 500, 120, 'Retry ×3, then\ndead-letter queue', { tone: C.amber, size: 28 });
        k.arrow([[760, 745], [956, 755]], { stroke: C.amber.stroke });
        k.step('Only after the commit');
        down(785);
        main(825, 'Publish archival request', C.green);
        down(920);
        main(960, 'Commit Kafka offset', C.violet);
        k.arrow([[1460, 540], [1530, 540], [1530, 1007], [764, 1007]], { stroke: C.muted, dashed: true });
        k.line([[1460, 780], [1530, 780]], { stroke: C.muted, dashed: true });
        k.text(1000, 1075, 'every path ends here, so the lane never blocks', { size: 24, align: 'center', color: C.muted });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'The database',
      body: [
        P('PostgreSQL was chosen for **ACID transactions** and **rich joins**: analytics apps combine array, disk and port data in one query.'),
        P('Each file becomes rows in several related tables (`array_metrics`, `disk_stats`, `port_stats`), linked by `symm_id` + file time. They are written between one `BEGIN` and one `COMMIT`: all of them, or none.'),
        P('Before inserting, the worker checks a small `processed_files` table for this file\'s (array, time, fingerprint). If it is there, the file is skipped; if not, the data and the `processed_files` row are committed **together**.'),
        P('This is what makes Kafka\'s redeliveries safe. Kafka promises **at least once**; the database turns that into **effectively once**.'),
        P('Writes never stop, so we scaled in layers and stopped at the first one that was enough:'),
        OL([
          '**Tune**: one multi-row insert per file, WAL settings for heavy writes, and **PgBouncer** so N workers share a few connections.',
          '**Read replicas**: analytics queries go to replicas, keeping the primary for writes.',
          '**Monthly partitions**: new writes always hit a small, hot partition; old months become read-only.'
        ]),
        P('Sharding by `symm_id` is the escape hatch we deliberately did **not** take. At ~60 writes per second at peak we use about **1%** of what one tuned primary handles (5K–10K TPS). Sharding would add routing and break cross-shard joins for no gain.'),
        NOTE('mint', 'Design rule: **pick the simplest setup that has headroom**, and write down what would make you change it (here: 100× more arrays).')
      ],
      draw(k) {
        title(k, 'Atomic, idempotent, and only as complex as needed');
        k.step('PostgreSQL was chosen');
        db(k, 60, 175, 700, 110, 'PostgreSQL: transactions + joins', C.sky, 28);
        k.step('Each file becomes rows');
        k.rect(60, 340, 700, 520, { stroke: C.sky.stroke, fill: 'transparent', dashed: true });
        k.text(90, 352, 'BEGIN', { size: 26, mono: true, color: C.sky.stroke });
        ['array_metrics', 'disk_stats', 'port_stats'].forEach((t, i) => k.box(120, 410 + i * 95, 580, 75, t, { tone: C.sky, size: 26 }));
        k.text(90, 815, 'COMMIT', { size: 26, mono: true, color: C.sky.stroke });
        k.step('Before inserting');
        k.box(120, 695, 580, 100, 'processed_files\n(array, time, fingerprint)', { tone: C.green, size: 26 });
        k.step('This is what makes');
        k.box(60, 900, 700, 130, 'Kafka: at least once\n+ skip if seen = effectively once', { tone: C.green, size: 28 });
        k.step('Writes never stop');
        k.text(1170, 175, 'Scaling, layer by layer', { size: 30, align: 'center', bold: true });
        [['1  Tune: batch inserts,\nWAL, PgBouncer   ✓'], ['2  Read replicas\nfor analytics   ✓'], ['3  Monthly time\npartitions   ✓']]
          .forEach(([t], i) => k.box(860, 230 + i * 160, 620, 135, t, { tone: C.green, size: 28 }));
        k.step('Sharding by');
        k.box(860, 710, 620, 135, '4  Shard by symm_id\nnot needed', { tone: muted, size: 28, dashed: true });
        k.box(860, 900, 620, 130, 'Peak ~60 TPS ≈ 1% of one\ntuned primary (5K–10K TPS)', { tone: C.amber, size: 28 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Archiving safely',
      body: [
        P('Once a file is safely in the database, it should leave the busy source NAS, but it must never just vanish. The **archival service** reads the original, compresses it with **zstd** (smaller than gzip at a similar speed) and writes it to the **archive NAS**.'),
        P('Then it reads the archived copy back and checks its fingerprint. If anything is wrong it retries with backoff, and the original stays where it is.'),
        P('Only after a verified archive does it delete the original and record the archive path in `processed_files`. The order is the whole point: the worst case is **two copies, never zero**.'),
        P('Archives follow one path pattern, so finding a file later needs no search:'),
        P('`archive/{symm_id}/{YYYY-MM-DD}/{file}.zst`'),
        P('Why a separate service and not part of the worker? Compression and NAS writes are slow and can wait. Keeping them apart means **parsing never waits for archiving**, and a backlog of archiving work never delays fresh data.'),
        P('Archives are kept for a configurable period (for example 90 days), and a daily cleanup job removes older ones.')
      ],
      draw(k) {
        title(k, 'Archive first, delete last');
        const box = (x, y, t, tone) => k.box(x, y, 400, 130, t, { tone, size: 28 });
        k.step('Once a file is safely');
        box(80, 230, '1  Read original\nfrom source NAS', C.amber);
        k.arrow([[480, 295], [596, 295]]);
        box(600, 230, '2  Compress\nwith zstd', C.green);
        k.arrow([[1000, 295], [1116, 295]]);
        box(1120, 230, '3  Write to\narchive NAS', C.green);
        k.step('Then it reads');
        k.arrow([[1320, 360], [1320, 466]]);
        box(1120, 470, '4  Read back,\nverify fingerprint', C.sky);
        k.arrow([[1520, 535], [1565, 535], [1565, 190], [280, 190], [280, 226]], { stroke: C.amber.stroke, dashed: true });
        k.text(920, 150, 'fail → retry with backoff (original kept)', { size: 24, align: 'center', color: C.amber.stroke });
        k.step('Only after a verified');
        k.arrow([[1120, 535], [1004, 535]]);
        k.text(1030, 495, 'pass', { size: 24, color: C.green.stroke });
        box(600, 470, '5  Delete original\nfrom source NAS', C.rose);
        k.arrow([[600, 535], [484, 535]]);
        box(80, 470, '6  Record archive path\nin processed_files', C.sky);
        k.step('Archives follow one path');
        k.box(80, 700, 1440, 100, 'archive/{symm_id}/{YYYY-MM-DD}/{file}.zst', { tone: C.slate, size: 30 });
        k.step('Why a separate service');
        k.box(80, 860, 700, 150, 'Separate service: parsing\nnever waits for archiving', { tone: C.sky, size: 28 });
        k.step('Archives are kept');
        k.box(820, 860, 700, 150, 'Retention: e.g. 90 days,\nthen a daily cleanup job', { tone: C.amber, size: 28 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'When things go wrong',
      body: [
        P('In a system that runs 24×7, failure is normal. The design sorts every failure into one of four kinds, and each kind has exactly one response.'),
        P('Transient failures (a database timeout, the NAS or a Kafka broker briefly down) are retried with exponential backoff. After the maximum retries the task moves to the **DLQ**.'),
        P('Corrupt files (bad fingerprint, malformed content) are quarantined immediately: the file goes to a quarantine folder and the reason goes into a table. **Never retried**, because it would fail the same way.'),
        P('Persistent failures (a schema mismatch, an unknown file format) also end in the DLQ. Each DLQ message carries the original task and its failure history, so after fixing the cause an engineer can **replay** it.'),
        P('Crashes (a worker dies, runs out of memory) need no code at all: Kafka notices and redelivers the unfinished message to another worker.'),
        P('Seeing all this needs three kinds of signals. Logs: every service writes structured logs to a Kafka topic; Logstash indexes them into Elasticsearch and Kibana searches them by array, task or level.'),
        P('Metrics: Prometheus scrapes every service and Grafana shows them. The single most important number is **consumer lag**: how far the workers are behind.'),
        P('Traces: the `task_id` created at ingestion travels through every step, so one file\'s whole journey can be followed end to end.'),
        P('Alerts fire on: any message in the DLQ, a spike in quarantined files, rising retries, or growing lag. They go to Slack or PagerDuty.'),
        NOTE('red', 'Logs go through Kafka, not straight to Elasticsearch, so a slow or broken Elasticsearch never slows down the pipeline. Search is briefly unavailable; data is not.')
      ],
      draw(k) {
        title(k, 'Four kinds of failure, one response each');
        const row = (i, kind, tone, ex, act) => {
          const y = 170 + i * 135;
          k.box(60, y, 300, 115, kind, { tone, size: 30 });
          k.box(380, y, 520, 115, ex, { tone: muted, size: 24 });
          k.box(920, y, 600, 115, act, { tone, size: 26 });
        };
        k.step('Transient failures');
        row(0, 'Transient', C.amber, 'DB timeout, NAS or\nbroker briefly down', 'Retry with backoff,\nthen dead-letter queue');
        k.step('Corrupt files');
        row(1, 'Corrupt', C.rose, 'bad fingerprint,\nmalformed file', 'Quarantine now,\nnever retry');
        k.step('Persistent failures');
        row(2, 'Persistent', C.violet, 'schema mismatch,\nunknown format', 'DLQ, fix the cause,\nthen replay');
        k.step('Crashes');
        row(3, 'Crash', C.sky, 'worker dies,\nout of memory', 'Kafka redelivers to\nanother worker');
        const pillar = (x, t, tone) => k.box(x, 740, 460, 190, t, { tone, size: 26 });
        k.step('Seeing all this');
        pillar(60, 'Logs\nKafka → Logstash →\nElasticsearch → Kibana', C.slate);
        k.step('Metrics:');
        pillar(560, 'Metrics\nPrometheus + Grafana\n#1 number: consumer lag', C.slate);
        k.step('Traces:');
        pillar(1060, 'Traces\none task_id follows\nthe file end to end', C.slate);
        k.step('Alerts fire on');
        k.box(60, 970, 1460, 110, 'Alert: DLQ > 0  ·  quarantine spike  ·  retries up  ·  lag growing  →  Slack / PagerDuty', { tone: C.rose, size: 26 });
      }
    },
    // ------------------------------------------------------------------------------------------------
    {
      title: 'Decisions and trade-offs',
      body: [
        P('Every design choice buys something and costs something. These six shaped the system:'),
        P('Kafka keyed by array: each array\'s files stay in order and different arrays run in parallel. The cost: partitions cap the number of workers.'),
        P('Parse and load in one worker: atomic, simple, one hop shorter. The cost: parsing and loading cannot scale separately (not needed at this load).'),
        P('At-least-once plus a duplicate check: nothing is lost and nothing is loaded twice. The cost: one small lookup per file.'),
        P('One primary with replicas, no sharding: simple to run with about 99% headroom. The cost: all writes depend on one primary (covered by automatic failover).'),
        P('A separate archival service: parsing never waits on slow disk work. The cost: one more service to deploy and watch.'),
        P('Quarantine instead of retrying bad files: a broken file never blocks a lane. The cost: someone has to look at quarantined files.'),
        NOTE('mint', '**In one sentence:** files are discovered once, queued per array in Kafka, loaded atomically and idempotently by stateless workers, archived only after verification, and every failure lands somewhere visible.'),
        MORE('sky', 'How it survives losing any single machine', [
          '**Worker** dies → Kafka gives its partitions to the others and redelivers the in-flight task.',
          '**Kafka broker** dies → every message has 3 copies (replication factor ≥ 3) on other brokers.',
          '**PostgreSQL primary** dies → a replica is promoted; workers retry for a few seconds.',
          '**Redis** dies → Sentinel promotes a replica; a few duplicate tasks may slip through and the database skips them.',
          '**NAS** unavailable → ingestion pauses and everything retries; files are never deleted before they are archived and verified.'
        ])
      ],
      draw(k) {
        title(k, 'What we chose, and what it cost');
        k.text(290, 125, 'Decision', { size: 28, align: 'center', bold: true });
        k.text(790, 125, 'We gained', { size: 28, align: 'center', bold: true, color: C.green.stroke });
        k.text(1290, 125, 'We paid', { size: 28, align: 'center', bold: true, color: C.rose.stroke });
        const rows = [
          ['Kafka keyed by array', 'Kafka keyed by array', 'order per array,\nparallel across arrays', 'partitions cap workers'],
          ['Parse and load in one worker', 'Parse + load in\none worker', 'atomic, simple,\none hop less', 'can\'t scale them\nseparately'],
          ['At-least-once plus', 'At-least-once +\nduplicate check', 'no loss,\nno duplicates', 'one lookup per file'],
          ['One primary with replicas', 'Primary + replicas,\nno sharding', 'simple, ~99%\nheadroom', 'one write primary\n(auto failover)'],
          ['A separate archival service', 'Separate\narchival service', 'parsing never\nwaits on disk', 'one more service'],
          ['Quarantine instead', 'Quarantine bad files', 'a bad file never\nblocks a lane', 'manual\ninvestigation']
        ];
        rows.forEach(([prefix, d, gain, cost], i) => {
          const y = 175 + i * 160;
          k.step(prefix);
          k.box(60, y, 460, 135, d, { tone: C.slate, size: 28 });
          k.box(560, y, 460, 135, gain, { tone: C.green, size: 26 });
          k.box(1060, y, 460, 135, cost, { tone: C.rose, size: 26 });
        });
      }
    }
  ]
};
