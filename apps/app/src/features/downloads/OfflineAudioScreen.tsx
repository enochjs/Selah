import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  BookOpen,
  Download,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  Wifi,
} from "lucide-react-native";
import { bibleRepository } from "../../data/bible-repository";
import type { Book, Locale } from "../../domain/models";
import type {
  ChapterDownload,
  DownloadPlan,
  DownloadScope,
  DownloadStatus,
  OfflineAudioContextValue,
} from "../../domain/offline-audio";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts } from "../../shared/theme";
import {
  Button,
  Dialog,
  Eyebrow,
  IconButton,
  Panel,
  Pill,
  Txt,
} from "../../shared/ui";
import { useOfflineAudio } from "./OfflineAudioProvider";

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{
        height: 5,
        borderRadius: 3,
        backgroundColor: c.sidebar,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${Math.min(100, Math.max(0, value * 100))}%`,
          height: "100%",
          backgroundColor: c.green,
        }}
      />
    </View>
  );
}

type DownloadParams = {
  bookId?: string | string[];
  chapter?: string | string[];
  locale?: string | string[];
};

export function OfflineAudioScreen() {
  const params = useLocalSearchParams<DownloadParams>();
  return <OfflineAudioContent key={JSON.stringify(params)} params={params} />;
}

function OfflineAudioContent({ params }: { params: DownloadParams }) {
  const { bi, locale: interfaceLocale } = useI18n();
  const initialLocale = useAppStore((s) => s.audioLocale);
  const setChapter = useAppStore((s) => s.setChapter);
  const {
    state,
    prepare,
    enqueue,
    pause,
    resume,
    remove,
  }: OfflineAudioContextValue = useOfflineAudio();
  const [requestedLocale] = useState<Locale>(() =>
    params.locale === "en" || params.locale === "zh"
      ? params.locale
      : initialLocale,
  );
  const books = bibleRepository.listBooks();
  const requestedBook =
    typeof params.bookId === "string"
      ? books.find((book) => book.id === params.bookId)
      : undefined;
  const requestedChapter =
    typeof params.chapter === "string" && /^\d+$/.test(params.chapter)
      ? Number(params.chapter)
      : 0;
  const hasChapterRequest =
    params.bookId !== undefined || params.chapter !== undefined;
  const validChapterRequest =
    requestedBook !== undefined &&
    Number.isSafeInteger(requestedChapter) &&
    requestedChapter > 0 &&
    requestedChapter <= requestedBook.chapters.length &&
    (params.locale === undefined ||
      params.locale === "en" ||
      params.locale === "zh");
  const [locale, setLocale] = useState<Locale>(requestedLocale);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [choosingBook, setChoosingBook] = useState(false);
  const [preparing, setPreparing] = useState(
    hasChapterRequest && validChapterRequest,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(() =>
    hasChapterRequest && !validChapterRequest
      ? bi(
          "无法找到指定章节，请重新选择下载范围。",
          "This chapter could not be found. Choose a download selection below.",
        )
      : null,
  );
  const [candidate, setCandidate] = useState<{
    plan: DownloadPlan;
    label: string;
    locale: Locale;
  } | null>(null);
  const [deleting, setDeleting] = useState<{
    book: Book;
    chapters: ChapterDownload[];
  } | null>(null);
  const [expandedBook, setExpandedBook] = useState<string | null>(null);
  const requestKey = JSON.stringify([
    params.bookId,
    params.chapter,
    params.locale,
    requestedLocale,
  ]);
  const preparedRequest = useRef<string | null>(null);
  useEffect(() => {
    if (
      !state.ready ||
      !hasChapterRequest ||
      !validChapterRequest ||
      !requestedBook ||
      preparedRequest.current === requestKey
    )
      return;
    preparedRequest.current = requestKey;
    void prepare(
      { kind: "chapter", bookId: requestedBook.id, chapter: requestedChapter },
      requestedLocale,
    )
      .then((plan) => {
        if (preparedRequest.current !== requestKey) return;
        if (!plan.chapters.length) {
          setNotice(
            bi(
              "本章暂无可下载的音频。",
              "No audio is available to download for this chapter.",
            ),
          );
          return;
        }
        const bookName =
          interfaceLocale === "zh" ? requestedBook.zh : requestedBook.en;
        setCandidate({
          plan,
          label: `${bookName} ${requestedChapter}`,
          locale: requestedLocale,
        });
      })
      .catch(() => {
        if (preparedRequest.current === requestKey)
          setNotice(
            bi(
              "暂时无法获取下载清单，请检查网络后重试。",
              "Could not prepare the download. Check your connection and try again.",
            ),
          );
      })
      .finally(() => {
        if (preparedRequest.current === requestKey) setPreparing(false);
      });
  }, [
    state.ready,
    hasChapterRequest,
    requestKey,
    validChapterRequest,
    requestedBook,
    requestedChapter,
    requestedLocale,
    prepare,
    bi,
    interfaceLocale,
  ]);
  const chapters = Object.values(state.chapters).filter(
    (chapter) => chapter.locale === locale,
  );
  const complete = chapters.filter(
    (chapter) => chapter.status === "complete",
  ).length;
  const storedBytes = Object.values(state.assets).reduce(
    (sum, asset) => sum + asset.size,
    0,
  );
  const files = new Map(
    chapters.flatMap((chapter) =>
      chapter.files.map((file) => [file.path, file] as const),
    ),
  );
  const totalBytes = [...files.values()].reduce(
    (sum, file) => sum + file.size,
    0,
  );
  const receivedBytes = [...files.values()].reduce(
    (sum, file) =>
      sum +
      (state.assets[file.path]?.size ??
        (state.activePath === file.path
          ? Math.min(file.size, state.activeBytes)
          : 0)),
    0,
  );
  const title = (book: Book) => (interfaceLocale === "zh" ? book.zh : book.en);
  const waiting = chapters.some((chapter) => chapter.status === "waiting");
  const pendingKeys = chapters
    .filter((chapter) =>
      ["queued", "downloading", "waiting"].includes(chapter.status),
    )
    .map((chapter) => chapter.key);
  const pausedKeys = chapters
    .filter(
      (chapter) => chapter.status === "paused" || chapter.status === "failed",
    )
    .map((chapter) => chapter.key);
  const statusLabel = (status: DownloadStatus) =>
    ({
      queued: bi("排队中", "Queued"),
      downloading: bi("正在下载", "Downloading"),
      paused: bi("已暂停", "Paused"),
      waiting:
        state.network === "offline"
          ? bi("等待联网", "Waiting for connection")
          : state.wifiOnly
            ? bi("等待 Wi-Fi", "Waiting for Wi-Fi")
            : bi("等待网络", "Waiting for network"),
      failed: bi("下载失败", "Failed"),
      complete: bi("已下载", "Downloaded"),
    })[status];
  const errorLabel = (chapter: ChapterDownload) =>
    ({
      network: bi(
        "网络中断，请联网后重试。",
        "Connection interrupted. Reconnect and retry.",
      ),
      storage: bi(
        "存储空间不足，请释放空间后重试。",
        "Free up storage and retry.",
      ),
      integrity: bi(
        "音频未能完整保存，请重试。",
        "The audio could not be saved completely. Retry the download.",
      ),
      unavailable: bi(
        "音频暂不可用，请稍后重试。",
        "Audio is currently unavailable. Try again later.",
      ),
      download: bi(
        "下载未完成，请重试。",
        "The download did not finish. Please retry.",
      ),
    })[chapter.error ?? "download"];

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
    } catch {
      setNotice(
        bi(
          "操作未完成，请重试。",
          "The action could not be completed. Please retry.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function prepareDownload(scope: DownloadScope, label: string) {
    setPreparing(true);
    setNotice(null);
    try {
      const plan = await prepare(scope, locale);
      setChoosingBook(false);
      if (plan.chapters.length === 0) {
        setNotice(
          bi(
            "此范围暂无可下载的音频。",
            "No audio is available to download for this selection.",
          ),
        );
      } else {
        setCandidate({ plan, label, locale });
      }
    } catch {
      setChoosingBook(false);
      setNotice(
        bi(
          "暂时无法获取下载清单，请检查网络后重试。",
          "Could not prepare the download. Check your connection and try again.",
        ),
      );
    } finally {
      setPreparing(false);
    }
  }

  if (!state.ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <ActivityIndicator color={c.green} />
        <Txt>{bi("正在读取离线音频…", "Loading offline audio…")}</Txt>
      </View>
    );
  }

  const insufficientSpace =
    candidate !== null &&
    candidate.plan.availableBytes !== null &&
    candidate.plan.bytes > candidate.plan.availableBytes;
  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <View
          style={{ maxWidth: 860, width: "100%", alignSelf: "center", gap: 22 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <IconButton
              icon={ArrowLeft}
              onPress={() => router.push("/music")}
              label={bi("返回聆听", "Back to Listen")}
            />
            <Eyebrow>LISTEN ANYWHERE</Eyebrow>
          </View>
          <View style={{ gap: 10 }}>
            <Txt
              style={{
                fontSize: 30,
                fontFamily:
                  interfaceLocale === "en" ? fonts.serif : fonts.medium,
              }}
            >
              {bi("离线音频", "Offline audio")}
            </Txt>
            <Txt style={{ color: c.muted, lineHeight: 22 }}>
              {bi(
                "提前下载，随时安心聆听。中英文音频分别保存。",
                "Download ahead and listen wherever you are. English and Chinese audio are saved separately.",
              )}
            </Txt>
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {(["en", "zh"] as const).map((language) => (
              <Pill
                key={language}
                active={locale === language}
                onPress={() => {
                  if (!preparing && !busy) setLocale(language);
                }}
              >
                {language === "en" ? "English · NIV" : "中文 · 和合本"}
              </Pill>
            ))}
          </View>
          {notice && (
            <Panel style={{ padding: 16, backgroundColor: c.sand }}>
              <Txt accessibilityLiveRegion="polite" style={{ lineHeight: 22 }}>
                {notice}
              </Txt>
            </Panel>
          )}
          <Panel style={{ padding: 22, gap: 16 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <Txt style={{ fontFamily: fonts.medium }}>
                {bi("已下载", "Downloaded")} {complete} / {chapters.length}{" "}
                {bi("章", "chapters")}
              </Txt>
              <Txt style={{ color: c.muted, fontSize: 12 }}>
                {bi("音频总占用", "Audio storage")} {bytesLabel(storedBytes)}
              </Txt>
            </View>
            {totalBytes > 0 && (
              <>
                <Progress
                  value={receivedBytes / totalBytes}
                  label={bi("下载总进度", "Overall download progress")}
                />
                <Txt style={{ color: c.muted, fontSize: 12 }}>
                  {bytesLabel(receivedBytes)} / {bytesLabel(totalBytes)} ·{" "}
                  {Math.min(
                    100,
                    Math.floor((receivedBytes / totalBytes) * 100),
                  )}
                  %
                </Txt>
              </>
            )}
            {waiting && (
              <Txt
                accessibilityLiveRegion="polite"
                style={{ color: c.gold, lineHeight: 22 }}
              >
                {state.network === "offline"
                  ? bi(
                      "目前没有网络，联网后自动继续下载。",
                      "You're offline. Downloads will continue when connected.",
                    )
                  : state.wifiOnly
                    ? bi(
                        "正在等待 Wi-Fi，连接后自动继续下载。",
                        "Waiting for Wi-Fi. Downloads will continue when connected.",
                      )
                    : bi(
                        "正在等待可用网络，连接后自动继续下载。",
                        "Waiting for a connection. Downloads will continue when available.",
                      )}
              </Txt>
            )}
            {(pendingKeys.length > 0 || pausedKeys.length > 0) && (
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                {pendingKeys.length > 0 && (
                  <Button
                    secondary
                    small
                    icon={Pause}
                    disabled={busy}
                    onPress={() => void run(() => pause(pendingKeys))}
                  >
                    {bi("全部暂停", "Pause all")}
                  </Button>
                )}
                {pausedKeys.length > 0 && (
                  <Button
                    secondary
                    small
                    icon={Play}
                    disabled={busy}
                    onPress={() => void run(() => resume(pausedKeys))}
                  >
                    {bi("继续 / 重试", "Resume / retry")}
                  </Button>
                )}
              </View>
            )}
          </Panel>
          <View style={{ gap: 14 }}>
            <Txt style={{ fontFamily: fonts.medium, fontSize: 17 }}>
              {bi("选择下载范围", "Choose what to download")}
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {validChapterRequest && requestedBook && (
                <Button
                  icon={Download}
                  secondary
                  disabled={preparing || busy}
                  onPress={() =>
                    void prepareDownload(
                      {
                        kind: "chapter",
                        bookId: requestedBook.id,
                        chapter: requestedChapter,
                      },
                      `${title(requestedBook)} ${requestedChapter}`,
                    )
                  }
                >
                  {bi("本章", "This chapter")} · {title(requestedBook)}{" "}
                  {requestedChapter}
                </Button>
              )}
              {(
                [
                  ["all", bi("整部圣经", "Whole Bible")],
                  ["old", bi("旧约", "Old Testament")],
                  ["new", bi("新约", "New Testament")],
                ] as const
              ).map(([kind, label]) => (
                <Button
                  key={kind}
                  icon={Download}
                  secondary={kind !== "all"}
                  disabled={preparing || busy}
                  onPress={() => void prepareDownload({ kind }, label)}
                >
                  {label}
                </Button>
              ))}
              <Button
                secondary
                icon={BookOpen}
                disabled={preparing || busy}
                onPress={() => setChoosingBook(true)}
              >
                {bi("指定书卷", "Choose a book")}
              </Button>
            </View>
            {preparing && (
              <View
                style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
              >
                <ActivityIndicator color={c.green} />
                <Txt>{bi("正在准备下载清单…", "Preparing your download…")}</Txt>
              </View>
            )}
          </View>
          {chapters.length === 0 && (
            <Panel style={{ padding: 28, alignItems: "center", gap: 12 }}>
              <Download color={c.green} size={30} strokeWidth={1.5} />
              <Txt>
                {bi(
                  "这个语言还没有离线音频。",
                  "No offline audio in this language yet.",
                )}
              </Txt>
              <Txt style={{ fontSize: 12, color: c.muted }}>
                {bi(
                  "选择上方范围，先查看下载大小。",
                  "Choose a selection above to check its download size.",
                )}
              </Txt>
            </Panel>
          )}
          {(["old", "new"] as const).map((testament) => {
            const downloadedBooks = books.filter(
              (book) =>
                book.testament === testament &&
                chapters.some((chapter) => chapter.bookId === book.id),
            );
            if (!downloadedBooks.length) return null;
            return (
              <View key={testament} style={{ gap: 12 }}>
                <Txt style={{ fontFamily: fonts.medium, fontSize: 18 }}>
                  {testament === "old"
                    ? bi("旧约", "Old Testament")
                    : bi("新约", "New Testament")}
                </Txt>
                {downloadedBooks.map((book) => {
                  const entries = chapters
                    .filter((chapter) => chapter.bookId === book.id)
                    .sort((a, b) => a.chapter - b.chapter);
                  const saved = entries.filter(
                    (chapter) => chapter.status === "complete",
                  ).length;
                  const pending = entries.filter((chapter) =>
                    ["queued", "downloading", "waiting"].includes(
                      chapter.status,
                    ),
                  );
                  const resumable = entries.filter(
                    (chapter) =>
                      chapter.status === "paused" ||
                      chapter.status === "failed",
                  );
                  const failed = entries.filter(
                    (chapter) => chapter.status === "failed",
                  );
                  const active = entries.find(
                    (chapter) => chapter.status === "downloading",
                  );
                  return (
                    <Panel key={book.id} style={{ padding: 20, gap: 13 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <View style={{ flex: 1, gap: 6 }}>
                          <Txt
                            style={{ fontFamily: fonts.medium, fontSize: 17 }}
                          >
                            {title(book)}
                          </Txt>
                          <Txt style={{ fontSize: 12, color: c.muted }}>
                            {bi("已下载", "Downloaded")} {saved} /{" "}
                            {book.chapters.length} {bi("章", "chapters")}
                          </Txt>
                        </View>
                        <IconButton
                          icon={Trash2}
                          disabled={busy}
                          onPress={() => {
                            setNotice(null);
                            setDeleting({ book, chapters: entries });
                          }}
                          label={bi(
                            `删除${title(book)}的${locale === "en" ? "英文" : "中文"}音频`,
                            `Delete ${title(book)} audio in ${locale === "en" ? "English" : "Chinese"}`,
                          )}
                        />
                      </View>
                      <Progress
                        value={saved / book.chapters.length}
                        label={`${title(book)} ${bi("章节进度", "chapter progress")}`}
                      />
                      <Txt
                        style={{
                          fontSize: 12,
                          color: failed.length ? c.red : c.muted,
                        }}
                      >
                        {active
                          ? `${bi("正在下载第", "Downloading chapter")} ${active.chapter}${bi("章", "")}`
                          : [
                              ...new Set(
                                entries.map((chapter) =>
                                  statusLabel(chapter.status),
                                ),
                              ),
                            ].join(" · ")}
                      </Txt>
                      {failed.length > 0 && (
                        <Txt
                          style={{ fontSize: 12, color: c.red, lineHeight: 20 }}
                        >
                          {errorLabel(failed[0])}
                        </Txt>
                      )}
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        {pending.length > 0 && (
                          <Button
                            secondary
                            small
                            icon={Pause}
                            disabled={busy}
                            onPress={() =>
                              void run(() =>
                                pause(pending.map((entry) => entry.key)),
                              )
                            }
                          >
                            {bi("暂停", "Pause")}
                          </Button>
                        )}
                        {resumable.length > 0 && (
                          <Button
                            secondary
                            small
                            icon={failed.length ? RefreshCw : Play}
                            disabled={busy}
                            onPress={() =>
                              void run(() =>
                                resume(resumable.map((entry) => entry.key)),
                              )
                            }
                          >
                            {failed.length
                              ? bi("重试", "Retry")
                              : bi("继续下载", "Resume")}
                          </Button>
                        )}
                        {saved > 0 && (
                          <Button
                            secondary
                            small
                            icon={BookOpen}
                            onPress={() => {
                              useAppStore.getState().setAudioLocale(locale);
                              setChapter(
                                book.id,
                                entries.find(
                                  (chapter) => chapter.status === "complete",
                                )?.chapter ?? 1,
                              );
                              router.push("/bible");
                            }}
                          >
                            {bi("前往阅读", "Read")}
                          </Button>
                        )}
                        <Button
                          secondary
                          small
                          onPress={() =>
                            setExpandedBook(
                              expandedBook === book.id ? null : book.id,
                            )
                          }
                        >
                          {expandedBook === book.id
                            ? bi("收起章节", "Hide chapters")
                            : bi("查看章节", "View chapters")}
                        </Button>
                      </View>
                      {expandedBook === book.id && (
                        <View style={{ gap: 10, paddingTop: 6 }}>
                          {entries.map((entry) => (
                            <View
                              key={entry.key}
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                gap: 12,
                              }}
                            >
                              <Txt style={{ fontSize: 12 }}>
                                {bi("第", "Chapter")} {entry.chapter}
                                {bi("章", "")}
                              </Txt>
                              <Txt
                                style={{
                                  fontSize: 12,
                                  color:
                                    entry.status === "failed" ? c.red : c.muted,
                                }}
                              >
                                {statusLabel(entry.status)}
                              </Txt>
                            </View>
                          ))}
                        </View>
                      )}
                    </Panel>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
      <Dialog
        visible={choosingBook}
        onClose={() => {
          if (!preparing) setChoosingBook(false);
        }}
        title={bi("选择书卷", "Choose a book")}
      >
        {(["old", "new"] as const).map((testament) => (
          <View key={testament} style={{ marginBottom: 24, gap: 12 }}>
            <Txt style={{ fontFamily: fonts.medium }}>
              {testament === "old"
                ? bi("旧约", "Old Testament")
                : bi("新约", "New Testament")}
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {books
                .filter((book) => book.testament === testament)
                .map((book) => (
                  <Button
                    key={book.id}
                    secondary
                    small
                    disabled={preparing}
                    onPress={() =>
                      void prepareDownload(
                        { kind: "book", bookId: book.id },
                        title(book),
                      )
                    }
                  >
                    {title(book)}
                  </Button>
                ))}
            </View>
          </View>
        ))}
        {preparing && <ActivityIndicator color={c.green} />}
      </Dialog>
      <Dialog
        visible={candidate !== null}
        onClose={() => {
          if (!busy) setCandidate(null);
        }}
        title={bi("确认下载", "Confirm download")}
      >
        {candidate && (
          <View style={{ gap: 18 }}>
            {notice && (
              <Txt
                accessibilityLiveRegion="polite"
                style={{ color: c.red, lineHeight: 22 }}
              >
                {notice}
              </Txt>
            )}
            <Txt style={{ fontFamily: fonts.medium, fontSize: 17 }}>
              {candidate.label} ·{" "}
              {candidate.locale === "en" ? "English · NIV" : "中文 · 和合本"}
            </Txt>
            <Txt>
              {candidate.plan.chapters.length} {bi("章", "chapters")} ·{" "}
              {bi("音频总大小", "Total audio")}{" "}
              {bytesLabel(candidate.plan.totalBytes)}
            </Txt>
            <Txt style={{ fontFamily: fonts.medium }}>
              {bi("本次需下载", "To download")}{" "}
              {bytesLabel(candidate.plan.bytes)}
            </Txt>
            <Txt style={{ color: c.muted }}>
              {bi("剩余存储空间", "Available storage")}{" "}
              {candidate.plan.availableBytes === null
                ? bi("暂时无法读取", "Unavailable")
                : bytesLabel(candidate.plan.availableBytes)}
            </Txt>
            {candidate.plan.bytes === 0 && (
              <Txt style={{ color: c.green }}>
                {bi(
                  "音频文件已保存在本机，无需再次下载。",
                  "Audio files are already saved on this device.",
                )}
              </Txt>
            )}
            {insufficientSpace && (
              <Txt style={{ color: c.red, lineHeight: 22 }}>
                {bi(
                  "空间不足，请释放空间或选择较小范围。",
                  "Not enough space. Free up storage or choose a smaller selection.",
                )}
              </Txt>
            )}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: wifiOnly, disabled: busy }}
              disabled={busy}
              onPress={() => setWifiOnly(!wifiOnly)}
              style={{
                flexDirection: "row",
                gap: 12,
                paddingVertical: 10,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 23,
                  height: 23,
                  borderWidth: 1,
                  borderColor: c.green,
                  borderRadius: 5,
                  backgroundColor: wifiOnly ? c.green : c.paper,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Txt style={{ color: "#fff" }}>{wifiOnly ? "✓" : ""}</Txt>
              </View>
              <Wifi size={18} color={c.green} />
              <Txt>{bi("仅 Wi-Fi 下载", "Download over Wi-Fi only")}</Txt>
            </Pressable>
            {!wifiOnly && (
              <Txt style={{ fontSize: 12, color: c.gold }}>
                {bi(
                  "可能使用移动数据，请留意流量。",
                  "Downloads may use mobile data.",
                )}
              </Txt>
            )}
            <Button
              icon={Download}
              disabled={busy || insufficientSpace}
              onPress={() =>
                void run(
                  async () => {
                    await enqueue(candidate.plan, wifiOnly);
                    setCandidate(null);
                  },
                  bi(
                    "下载已加入队列，可在此查看进度。",
                    "Added to downloads. Follow progress here.",
                  ),
                )
              }
            >
              {busy
                ? bi("正在添加…", "Adding…")
                : candidate.plan.bytes === 0
                  ? bi("保存到离线音频", "Keep offline")
                  : bi("确认下载", "Start download")}
            </Button>
            <Button
              secondary
              disabled={busy}
              onPress={() => setCandidate(null)}
            >
              {bi("取消", "Cancel")}
            </Button>
          </View>
        )}
      </Dialog>
      <Dialog
        visible={deleting !== null}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        title={bi("删除书卷音频？", "Delete book audio?")}
      >
        {deleting && (
          <View style={{ gap: 20 }}>
            {notice && (
              <Txt
                accessibilityLiveRegion="polite"
                style={{ color: c.red, lineHeight: 22 }}
              >
                {notice}
              </Txt>
            )}
            <Txt style={{ lineHeight: 24 }}>
              {bi(
                `将删除${title(deleting.book)}已保存的${locale === "en" ? "英文" : "中文"}音频，并移除此书卷的下载任务。以后可以重新下载。`,
                `Remove saved ${locale === "en" ? "English" : "Chinese"} audio and download tasks for ${title(deleting.book)}? You can download it again later.`,
              )}
            </Txt>
            <Txt style={{ color: c.muted, lineHeight: 22 }}>
              {bi(
                "经文、生词、收藏和学习记录会保留。",
                "Scripture, vocabulary, favorites, and learning history will be kept.",
              )}
            </Txt>
            <Button
              icon={Trash2}
              disabled={busy}
              style={{ backgroundColor: c.red }}
              onPress={() =>
                void run(
                  async () => {
                    await remove(deleting.chapters.map((entry) => entry.key));
                    setDeleting(null);
                  },
                  bi("已删除此书卷音频。", "Book audio deleted."),
                )
              }
            >
              {busy
                ? bi("正在删除…", "Deleting…")
                : bi("确认删除音频", "Delete audio")}
            </Button>
            <Button secondary disabled={busy} onPress={() => setDeleting(null)}>
              {bi("保留音频", "Keep audio")}
            </Button>
          </View>
        )}
      </Dialog>
    </>
  );
}
