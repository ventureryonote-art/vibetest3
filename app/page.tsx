// ─────────────────────────────────────────────────────────
// 検査結果の連絡待ち管理（docs/03_spec.md の実装）
//
// これは「業務アプリの画面」です。宣伝ページ（LP）ではありません。
//
// 画面の骨格（この形は崩さない）:
//   左メニュー（.side）＋ 上部バー（.topbar）＋ 本体（.content）
//   一覧 / 新規登録 / 設定 の3画面を view で切り替える
//
// 解くこと: 結果が返ってきたのに、まだ電話していない人が、返ってきた順に分かる
//
// 扱うのは患者の情報のため、次の3つは設計上の固定線（docs/01_customer.md ③）:
//   1. 外部に送らない（この端末の localStorage だけ）
//   2. 検査値・所見を持たない
//   3. 氏名はフルネームを必須にしない（カルテ番号＋姓）
// ─────────────────────────────────────────────────────────
"use client";

import { useEffect, useMemo, useState } from "react";

/** 連絡状況。「不在・かけ直し」は未連絡に残したまま、印だけ付く */
type Status = "waiting" | "absent" | "done";

/** 返ってきた検査結果1件。項目は5つ（docs/03_spec.md「4. データ項目」） */
type Result = {
  id: string;
  patient: string; // 患者（カルテ番号＋姓）
  exam: string;    // 検査の種類（血液 / 尿 / 病理 / 画像 / その他）
  date: string;    // 結果が返ってきた日 YYYY-MM-DD
  note: string;    // メモ（検査値・所見は書かない）
  status: Status;  // 連絡状況
};

type View = "list" | "new" | "settings";
type Filter = "open" | "done" | "all";

const KEY = "followup-data";
const NAME_KEY = "followup-appname";

const EXAMS = ["血液", "尿", "病理", "画像", "その他"];

/** 何日経ったら目立たせるか（結果は3〜5日で返る。翌日中には連絡したい） */
const LATE = 2;

const today = () => new Date().toISOString().slice(0, 10);

/** 今日から n 日前の日付 */
const dateBefore = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const daysAgo = (d: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(d + "T00:00:00").getTime()) / 86400000));

/** 未連絡＝まだ電話できていない（連絡待ち・不在のどちらも含む） */
const isOpen = (r: Result) => r.status !== "done";

/**
 * 見本データ3件。実在の人名・連絡先は使わない。
 * 開いた日からの相対日付にして、いつ開いても「2日以上経過」が1件出るようにする。
 */
const makeSample = (): Result[] => [
  { id: "s1", patient: "1042 見本A", exam: "血液", date: dateBefore(4), note: "夕方以降につながりやすい", status: "waiting" },
  { id: "s2", patient: "1187 見本B", exam: "尿", date: dateBefore(2), note: "携帯へ", status: "absent" },
  { id: "s3", patient: "1203 見本C", exam: "画像", date: dateBefore(1), note: "", status: "done" },
];

export default function Home() {
  const [items, setItems] = useState<Result[]>([]);
  const [appName, setAppName] = useState("検査結果の連絡待ち");
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Result | null>(null);

  // 入力フォーム
  const [form, setForm] = useState({ patient: "", exam: EXAMS[0], date: today(), note: "" });

  // 読み込みは必ず useEffect の中で
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setItems(raw ? (JSON.parse(raw) as Result[]) : makeSample());
      const n = localStorage.getItem(NAME_KEY);
      if (n) setAppName(n);
    } catch {
      setItems(makeSample());
    }
    setLoaded(true);
  }, []);

  // 保存も useEffect。読み込み完了前に走らせない
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(NAME_KEY, appName);
  }, [items, appName, loaded]);

  const counts = useMemo(
    () => ({
      open: items.filter(isOpen).length,
      done: items.filter((i) => i.status === "done").length,
      all: items.length,
      late: items.filter((i) => isOpen(i) && daysAgo(i.date) >= LATE).length,
    }),
    [items]
  );

  // 結果が返ってきた日が古い順＝待たせている順
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" ? true : filter === "done" ? i.status === "done" : isOpen(i)))
      .filter((i) => !k || (i.patient + i.note + i.exam).toLowerCase().includes(k))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [items, filter, q]);

  function resetForm() {
    setForm({ patient: "", exam: EXAMS[0], date: today(), note: "" });
    setEditing(null);
  }

  function save() {
    const patient = form.patient.trim();
    if (!patient) return;
    if (editing) {
      setItems(items.map((i) => (i.id === editing.id ? { ...i, ...form, patient } : i)));
    } else {
      // 新規は必ず「連絡待ち」で入る
      setItems([...items, { id: String(Date.now()), ...form, patient, status: "waiting" }]);
    }
    resetForm();
    setView("list");
  }

  function startEdit(r: Result) {
    setEditing(r);
    setForm({ patient: r.patient, exam: r.exam, date: r.date, note: r.note });
    setView("new");
  }

  /** 連絡済み ⇄ 連絡待ち。押し間違えても、もう一度押せば戻る */
  const toggleDone = (id: string) =>
    setItems(items.map((i) => (i.id === id ? { ...i, status: i.status === "done" ? "waiting" : "done" } : i)));

  /** 不在の印を付ける・外す。未連絡のまま残る */
  const toggleAbsent = (id: string) =>
    setItems(items.map((i) => (i.id === id ? { ...i, status: i.status === "absent" ? "waiting" : "absent" } : i)));

  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));

  const NAV: { k: View; label: string; count?: number }[] = [
    { k: "list", label: "一覧", count: counts.open },
    { k: "new", label: "新規登録" },
    { k: "settings", label: "設定" },
  ];

  const titles: Record<View, [string, string]> = {
    list: ["一覧", "まだ電話していない人が、結果が返ってきた順に並びます"],
    new: editing
      ? ["編集", "入力した内容で上書きします"]
      : ["新規登録", "保存すると、一覧に「連絡待ち」で追加されます"],
    settings: ["設定", "表示名の変更と、データの入れ直し"],
  };

  return (
    <div className="shell">
      {/* ───────── 左メニュー ───────── */}
      <nav className="side">
        <div className="side-brand">
          <div className="n">{appName}</div>
          <div className="s">この端末に保存</div>
        </div>
        <div className="side-label">メニュー</div>
        <div className="side-nav">
          {NAV.map((n) => (
            <button
              key={n.k}
              className="side-item"
              aria-current={view === n.k ? "page" : undefined}
              onClick={() => { if (n.k !== "new") resetForm(); setView(n.k); }}
            >
              {n.label}
              {typeof n.count === "number" && <span className="c">{n.count}</span>}
            </button>
          ))}
        </div>
        <div className="side-foot">全 {counts.all} 件</div>
      </nav>

      {/* ───────── 本体 ───────── */}
      <div className="main">
        <header className="topbar">
          <span className="t">{titles[view][0]}</span>
          <span className="d">{titles[view][1]}</span>
          {view === "list" && (
            <span className="right">
              <button className="btn" onClick={() => { resetForm(); setView("new"); }}>新規登録</button>
            </span>
          )}
        </header>

        <div className="content">
          {/* ── 一覧 ── */}
          {view === "list" && (
            <>
              <div className="stats">
                <div className="stat"><div className="n accent">{counts.open}</div><div className="l">未連絡</div></div>
                <div className="stat"><div className="n">{counts.late}</div><div className="l">{LATE}日以上経過</div></div>
                <div className="stat"><div className="n">{counts.all}</div><div className="l">全件</div></div>
              </div>

              <div className="filters">
                <div className="search">
                  <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="カルテ番号・姓・メモで検索" />
                </div>
                <div className="seg">
                  {(["open", "done", "all"] as Filter[]).map((f) => (
                    <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {f === "open" ? `未連絡 ${counts.open}` : f === "done" ? `連絡済み ${counts.done}` : `全部 ${counts.all}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="list">
                <div className="list-head">
                  {filter === "open" ? "未連絡（返ってきた日が古い順）" : filter === "done" ? "連絡済み" : "すべて（返ってきた日が古い順）"}
                  <span className="count">{shown.length} 件</span>
                </div>

                {shown.length === 0 ? (
                  <div className="empty">
                    <div className="t">
                      {q ? "見つかりませんでした"
                        : filter === "open" ? "未連絡の方はいません"
                        : filter === "done" ? "連絡済みの方はまだいません"
                        : "まだ1件も登録されていません"}
                    </div>
                    <div className="d">
                      {q ? "検索の言葉を変えてみてください。"
                        : filter === "open" ? "今かけ直す方はいません。結果が返ってきたら、右上の「新規登録」から1件ずつ入れてください。"
                        : "右上の「新規登録」から、返ってきた結果を1件ずつ入れてください。"}
                    </div>
                  </div>
                ) : (
                  shown.map((r) => {
                    const d = daysAgo(r.date);
                    return (
                      <div className="row" key={r.id}>
                        <div className="row-main">
                          <div className="row-title">{r.patient}</div>
                          {r.note && <div className="row-sub">{r.note}</div>}
                        </div>
                        <div className="row-meta">
                          {r.status === "done" ? (
                            <span className="badge badge-ok">連絡済み</span>
                          ) : (
                            <span className={d >= LATE ? "badge badge-warn" : "badge"}>
                              {d === 0 ? "今日" : `${d}日経過`}
                            </span>
                          )}
                          {r.status === "absent" && <span className="badge badge-danger">不在・かけ直し</span>}
                          <span className="badge">{r.exam}</span>
                          <span className="row-time">{r.date.slice(5).replace("-", "/")}</span>
                          <button className="btn-ghost" onClick={() => startEdit(r)}>編集</button>
                          {r.status !== "done" && (
                            <button className="btn-ghost" onClick={() => toggleAbsent(r.id)}>
                              {r.status === "absent" ? "不在を取り消す" : "不在だった"}
                            </button>
                          )}
                          <button className="btn-ghost" onClick={() => toggleDone(r.id)}>
                            {r.status === "done" ? "連絡待ちに戻す" : "連絡済みにする"}
                          </button>
                          <button className="btn-ghost danger-btn" onClick={() => remove(r.id)}>削除</button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <p className="note">データはこの端末のブラウザにだけ保存されます。外部には送信されません。</p>
            </>
          )}

          {/* ── 新規登録・編集 ── */}
          {view === "new" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-patient">患者（カルテ番号＋姓）<span className="req">必須</span></label>
                <input id="f-patient" className="field" value={form.patient}
                  onChange={(e) => setForm({ ...form, patient: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  placeholder="例：1042 山田" />
                <span className="hint">カルテ番号と姓だけで分かる書き方にします。フルネームは要りません</span>
              </div>

              <div className="form-row">
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-exam">検査の種類</label>
                    <select id="f-exam" className="select" value={form.exam}
                      onChange={(e) => setForm({ ...form, exam: e.target.value })}>
                      {EXAMS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="f-date">結果が返ってきた日</label>
                    <input id="f-date" className="field" type="date" value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                </div>
                <span className="hint">この日付が古いほど、一覧の上に来ます</span>
              </div>

              <div className="form-row">
                <label className="label" htmlFor="f-note">メモ</label>
                <textarea id="f-note" className="field" value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="つながりやすい時間・かけ先など" />
                <span className="hint">検査の数値や所見は書きません。ここは折り返しのための覚書だけにします</span>
              </div>

              <div className="form-actions">
                <button className="btn" onClick={save} disabled={!form.patient.trim()}>
                  {editing ? "この内容で保存する" : "一覧に追加する"}
                </button>
                <button className="btn-ghost" onClick={() => { resetForm(); setView("list"); }}>やめる</button>
                <span className="spacer" />
                {editing && (
                  <button className="btn-ghost danger-btn"
                    onClick={() => { remove(editing.id); resetForm(); setView("list"); }}>
                    この1件を削除
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── 設定 ── */}
          {view === "settings" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-app">画面の表示名</label>
                <input id="f-app" className="field" value={appName}
                  onChange={(e) => setAppName(e.target.value)} />
                <span className="hint">左上に表示されます。変えるとすぐ反映されます</span>
              </div>

              <div className="form-row">
                <label className="label">データ</label>
                <div className="inline">
                  <button className="btn-ghost" onClick={() => setItems(makeSample())}>見本データを入れ直す</button>
                  <button className="btn-ghost danger-btn"
                    onClick={() => { if (confirm("全部消します。よろしいですか？")) setItems([]); }}>
                    全部消す
                  </button>
                </div>
                <span className="hint">
                  現在 {counts.all} 件（未連絡 {counts.open} / 連絡済み {counts.done}）
                </span>
              </div>

              <p className="note">
                患者の情報を扱うため、データはこの端末のブラウザにだけ保存されます。
                検査の数値や所見は入力しないでください。別の端末や他の人とは共有されません（共有は第3回で扱います）。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
