// ─────────────────────────────────────────────────────────
// 体験授業の問い合わせ管理（docs/03_spec.md の実装）
//
// これは「業務アプリの画面」です。宣伝ページ（LP）ではありません。
//
// 画面の骨格（この形は崩さない）:
//   左メニュー（.side）＋ 上部バー（.topbar）＋ 本体（.content）
//   一覧 / 新規登録 / 設定 の3画面を view で切り替える
//
// 解くこと: 今日返信すべき問い合わせが、開いた瞬間に、待たせている順で分かる
// ─────────────────────────────────────────────────────────
"use client";

import { useEffect, useMemo, useState } from "react";

/** 問い合わせ1件。項目は5つ（docs/03_spec.md「4. データ項目」） */
type Inquiry = {
  id: string;
  name: string;      // 保護者名（生徒名）
  source: string;    // 流入元（LINE / 電話 / HP / その他）
  date: string;      // 問い合わせ日 YYYY-MM-DD
  note: string;      // メモ
  replied: boolean;  // 返信済みか
};

type View = "list" | "new" | "settings";
type Filter = "open" | "replied" | "all";

const KEY = "inquiry-data";
const NAME_KEY = "inquiry-appname";

const SOURCES = ["LINE", "電話", "HP", "その他"];

const today = () => new Date().toISOString().slice(0, 10);

/** 今日から n 日前の日付 */
const dateBefore = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const daysAgo = (d: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(d + "T00:00:00").getTime()) / 86400000));

/**
 * 見本データ3件。実在の人名・連絡先は使わない。
 * 開いた日からの相対日付にして、いつ開いても「3日以上 待たせている」が1件出るようにする。
 */
const makeSample = (): Inquiry[] => [
  { id: "s1", name: "見本：Aさん（中2）", source: "LINE", date: dateBefore(5), note: "週2希望・英語と数学", replied: false },
  { id: "s2", name: "見本：Bさん（小5）", source: "電話", date: dateBefore(2), note: "18時以降に折り返し希望", replied: false },
  { id: "s3", name: "見本：Cさん（高1）", source: "HP", date: dateBefore(6), note: "体験の日程を案内済み", replied: true },
];

export default function Home() {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [appName, setAppName] = useState("体験授業の問い合わせ");
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Inquiry | null>(null);

  // 入力フォーム
  const [form, setForm] = useState({ name: "", source: SOURCES[0], date: today(), note: "" });

  // 読み込みは必ず useEffect の中で
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setItems(raw ? (JSON.parse(raw) as Inquiry[]) : makeSample());
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
      open: items.filter((i) => !i.replied).length,
      replied: items.filter((i) => i.replied).length,
      all: items.length,
      late: items.filter((i) => !i.replied && daysAgo(i.date) >= 3).length,
    }),
    [items]
  );

  // 問い合わせ日が古い順＝待たせている順
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" ? true : filter === "replied" ? i.replied : !i.replied))
      .filter((i) => !k || (i.name + i.note + i.source).toLowerCase().includes(k))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [items, filter, q]);

  function resetForm() {
    setForm({ name: "", source: SOURCES[0], date: today(), note: "" });
    setEditing(null);
  }

  function save() {
    const name = form.name.trim();
    if (!name) return;
    if (editing) {
      setItems(items.map((i) => (i.id === editing.id ? { ...i, ...form, name } : i)));
    } else {
      // 新規は必ず「未返信」で入る
      setItems([...items, { id: String(Date.now()), ...form, name, replied: false }]);
    }
    resetForm();
    setView("list");
  }

  function startEdit(r: Inquiry) {
    setEditing(r);
    setForm({ name: r.name, source: r.source, date: r.date, note: r.note });
    setView("new");
  }

  const toggle = (id: string) =>
    setItems(items.map((i) => (i.id === id ? { ...i, replied: !i.replied } : i)));
  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));

  const NAV: { k: View; label: string; count?: number }[] = [
    { k: "list", label: "一覧", count: counts.open },
    { k: "new", label: "新規登録" },
    { k: "settings", label: "設定" },
  ];

  const titles: Record<View, [string, string]> = {
    list: ["一覧", "返信していない人が、待たせている順に並びます"],
    new: editing
      ? ["編集", "入力した内容で上書きします"]
      : ["新規登録", "保存すると、一覧に「未返信」で追加されます"],
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
                <div className="stat"><div className="n accent">{counts.open}</div><div className="l">未返信</div></div>
                <div className="stat"><div className="n">{counts.late}</div><div className="l">3日以上 待たせている</div></div>
                <div className="stat"><div className="n">{counts.all}</div><div className="l">全件</div></div>
              </div>

              <div className="filters">
                <div className="search">
                  <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="保護者名・メモで検索" />
                </div>
                <div className="seg">
                  {(["open", "replied", "all"] as Filter[]).map((f) => (
                    <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {f === "open" ? `未返信 ${counts.open}` : f === "replied" ? `返信済み ${counts.replied}` : `全部 ${counts.all}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="list">
                <div className="list-head">
                  {filter === "open" ? "未返信（待たせている順）" : filter === "replied" ? "返信済み" : "すべて（問い合わせが古い順）"}
                  <span className="count">{shown.length} 件</span>
                </div>

                {shown.length === 0 ? (
                  <div className="empty">
                    <div className="t">
                      {q ? "見つかりませんでした"
                        : filter === "open" ? "未返信の問い合わせはありません"
                        : filter === "replied" ? "返信済みの問い合わせはまだありません"
                        : "まだ1件も登録されていません"}
                    </div>
                    <div className="d">
                      {q ? "検索の言葉を変えてみてください。"
                        : filter === "open" ? "今日返信すべき人はいません。新しく来た問い合わせは、右上の「新規登録」から入れてください。"
                        : "右上の「新規登録」から、受けた問い合わせを1件ずつ入れてください。"}
                    </div>
                  </div>
                ) : (
                  shown.map((r) => {
                    const d = daysAgo(r.date);
                    return (
                      <div className="row" key={r.id}>
                        <div className="row-main">
                          <div className="row-title">{r.name}</div>
                          {r.note && <div className="row-sub">{r.note}</div>}
                        </div>
                        <div className="row-meta">
                          {r.replied ? (
                            <span className="badge badge-ok">返信済み</span>
                          ) : (
                            <span className={d >= 3 ? "badge badge-warn" : "badge"}>
                              {d === 0 ? "今日" : `${d}日待ち`}
                            </span>
                          )}
                          <span className="badge">{r.source}</span>
                          <span className="row-time">{r.date.slice(5).replace("-", "/")}</span>
                          <button className="btn-ghost" onClick={() => startEdit(r)}>編集</button>
                          <button className="btn-ghost" onClick={() => toggle(r.id)}>
                            {r.replied ? "未返信に戻す" : "返信済みにする"}
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
                <label className="label" htmlFor="f-name">保護者名（生徒名）<span className="req">必須</span></label>
                <input id="f-name" className="field" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  placeholder="例：山田さま（中2）" />
                <span className="hint">あとで見て誰か分かる書き方にします</span>
              </div>

              <div className="form-row">
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-src">流入元</label>
                    <select id="f-src" className="select" value={form.source}
                      onChange={(e) => setForm({ ...form, source: e.target.value })}>
                      {SOURCES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="f-date">問い合わせを受けた日</label>
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
                  placeholder="希望曜日・科目・折り返し時間など" />
              </div>

              <div className="form-actions">
                <button className="btn" onClick={save} disabled={!form.name.trim()}>
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
                  現在 {counts.all} 件（未返信 {counts.open} / 返信済み {counts.replied}）
                </span>
              </div>

              <p className="note">
                保護者名を扱うため、データはこの端末のブラウザにだけ保存されます。
                別の端末や他の人とは共有されません（共有は第3回で扱います）。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
