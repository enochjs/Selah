import { DownloadProgress } from "../../domain/download-progress";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  BookOpen,
  Download,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react-native";
import { bibleRepository } from "../../data/bible-repository";
import type { Book, Locale } from "../../domain/models";
import type {
  ChapterDownload,
  DownloadScope,
  DownloadStatus,
  OfflineAudioContextValue,
} from "../../domain/offline-audio";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts } from "../../shared/theme";
import { Button, Eyebrow, IconButton, Panel, Pill, Txt } from "../../shared/ui";
import { useOfflineAudio } from "./OfflineAudioProvider";
import { DownloadBookDialog } from "./DownloadBookDialog";
import {
  DownloadConfirmDialog,
  type DownloadCandidate,
} from "./DownloadConfirmDialog";
import { DeleteBookAudioDialog } from "./DeleteBookAudioDialog";
import { bytesLabel } from "./download-format";
import { OfflineHymnsSection } from "./OfflineHymnsSection";

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
  const focused = useIsFocused();
  const params = useLocalSearchParams<DownloadParams>();
  const { bi } = useI18n();
  const { state, initializationError, retryInitialization } = useOfflineAudio();
  // Download confirmations describe a navigation request, not persistent tab
  // state. Remount them on return so repeating the same request prepares again.
  if (!focused) return null;
  if (!state.ready)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 20,
        }}
      >
        {initializationError ? (
          <>
            <Txt>
              {bi("离线资料暂时无法读取", "Could not read offline audio")}
            </Txt>
            <Button onPress={retryInitialization}>{bi("重试", "Retry")}</Button>
          </>
        ) : (
          <>
            <ActivityIndicator color={c.green} />
            <Txt>{bi("正在读取离线资料", "Loading offline audio")}</Txt>
          </>
        )}
        <Button secondary onPress={() => router.push("/me")}>
          {bi("返回我的", "Back to My space")}
        </Button>
      </View>
    );
  return <OfflineAudioContent key={JSON.stringify(params)} params={params} />;
}

function OfflineAudioContent({ params }: { params: DownloadParams }) {
  const { bi, locale: interfaceLocale } = useI18n();
  const initialLocale = useAppStore((s) => s.primaryLocale);
  const setChapter = useAppStore((s) => s.setChapter);
  const {
    state,
    initializationError,
    retryInitialization,
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
  const [candidate, setCandidate] = useState<DownloadCandidate | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const preparingRef = useRef(preparing);
  const busyRef = useRef(false);
  const choosingBookRef = useRef(false);
  const pendingCandidate = useRef<DownloadCandidate | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingCandidate.current = null;
    };
  }, []);
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
        if (!mounted.current || preparedRequest.current !== requestKey) return;
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
        if (mounted.current && preparedRequest.current === requestKey)
          setNotice(
            bi(
              "暂时无法获取下载清单，请检查网络后重试。",
              "Could not prepare the download. Check your connection and try again.",
            ),
          );
      })
      .finally(() => {
        if (mounted.current && preparedRequest.current === requestKey) {
          preparingRef.current = false;
          setPreparing(false);
        }
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
  const chapters = useMemo(
    () =>
      Object.values(state.chapters).filter(
        (chapter): chapter is ChapterDownload =>
          chapter.kind !== "hymn" && chapter.locale === locale,
      ),
    [state.chapters, locale],
  );
  const complete = chapters.filter(
    (chapter) => chapter.status === "complete",
  ).length;
  const progress = useMemo(() => new DownloadProgress(), []);
  const { storedBytes, totalBytes, receivedBytes } = progress.select(
    state,
    locale,
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

  async function run(
    action: () => Promise<void>,
    success?: string,
    inDialog = false,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    setDialogError(null);
    try {
      await action();
      if (success) setNotice(success);
    } catch {
      const showError = inDialog ? setDialogError : setNotice;
      showError(
        bi(
          "操作未完成，请重试。",
          "The action could not be completed. Please retry.",
        ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function prepareDownload(scope: DownloadScope, label: string) {
    if (preparingRef.current || busyRef.current || pendingCandidate.current)
      return;
    preparingRef.current = true;
    setPreparing(true);
    setNotice(null);
    setPrepareError(null);
    setDialogError(null);
    const fromBook = choosingBookRef.current;
    if (scope.kind === "book") setSelectedBookId(scope.bookId);
    const showError = fromBook ? setPrepareError : setNotice;
    try {
      const plan = await prepare(scope, locale);
      if (!mounted.current) return;
      if (plan.chapters.length === 0) {
        showError(
          bi(
            "此范围暂无可下载的音频。",
            "No audio is available to download for this selection.",
          ),
        );
      } else {
        const next = { plan, label, locale };
        if (fromBook) {
          pendingCandidate.current = next;
          setChoosingBook(false);
        } else {
          setCandidate(next);
        }
      }
    } catch {
      if (!mounted.current) return;
      showError(
        bi(
          "暂时无法获取下载清单，请检查网络后重试。",
          "Could not prepare the download. Check your connection and try again.",
        ),
      );
    } finally {
      if (mounted.current) {
        preparingRef.current = false;
        setPreparing(false);
      }
    }
  }

  function closeBookChooser() {
    if (preparingRef.current) return;
    pendingCandidate.current = null;
    setChoosingBook(false);
  }

  function bookChooserDismissed() {
    choosingBookRef.current = false;
    const next = pendingCandidate.current;
    pendingCandidate.current = null;
    if (mounted.current && next) setCandidate(next);
  }

  function closeConfirmation() {
    if (busyRef.current) return;
    setCandidate(null);
    setDialogError(null);
  }

  async function confirmDownload() {
    if (
      !candidate ||
      (candidate.plan.availableBytes !== null &&
        candidate.plan.bytes > candidate.plan.availableBytes)
    )
      return;
    await run(
      async () => {
        await enqueue(candidate.plan, wifiOnly);
        if (mounted.current) setCandidate(null);
      },
      bi(
        "下载已加入队列，可在此查看进度。",
        "Added to downloads. Follow progress here.",
      ),
      true,
    );
  }

  function closeDeletion() {
    if (busyRef.current) return;
    setDeleting(null);
    setDialogError(null);
  }

  async function confirmDeletion() {
    if (!deleting) return;
    await run(
      async () => {
        await remove(deleting.chapters.map((entry) => entry.key));
        if (mounted.current) setDeleting(null);
      },
      bi("已删除此书卷音频。", "Book audio deleted."),
      true,
    );
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
        {initializationError ? (
          <>
            <Txt>
              {bi("离线资料暂时无法读取", "Could not read offline audio")}
            </Txt>
            <Button onPress={retryInitialization}>{bi("重试", "Retry")}</Button>
          </>
        ) : (
          <>
            <ActivityIndicator color={c.green} />
            <Txt>{bi("正在读取离线音频…", "Loading offline audio…")}</Txt>
          </>
        )}
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <View
          style={{ maxWidth: 860, width: "100%", alignSelf: "center", gap: 22 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <IconButton
              icon={ArrowLeft}
              onPress={() => router.push("/me")}
              label={bi("返回我的", "Back to My space")}
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
          <OfflineHymnsSection />
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
                onPress={() => {
                  if (
                    preparingRef.current ||
                    busyRef.current ||
                    choosingBookRef.current
                  )
                    return;
                  choosingBookRef.current = true;
                  pendingCandidate.current = null;
                  setPrepareError(null);
                  setSelectedBookId(null);
                  setChoosingBook(true);
                }}
              >
                {bi("指定书卷", "Choose a book")}
              </Button>
            </View>
            {preparing && !choosingBook && (
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
                            setDialogError(null);
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
                              useAppStore.getState().setPrimaryLocale(locale);
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
      <DownloadBookDialog
        visible={choosingBook}
        books={books}
        selectedBookId={selectedBookId}
        preparing={preparing}
        error={prepareError}
        onClose={closeBookChooser}
        onDismiss={bookChooserDismissed}
        onBook={(book) =>
          prepareDownload({ kind: "book", bookId: book.id }, title(book))
        }
        onRetry={async () => {
          const book = books.find((book) => book.id === selectedBookId);
          if (book)
            await prepareDownload(
              { kind: "book", bookId: book.id },
              title(book),
            );
        }}
      />
      <DownloadConfirmDialog
        candidate={candidate}
        busy={busy}
        error={dialogError}
        wifiOnly={wifiOnly}
        onWifiOnly={setWifiOnly}
        onClose={closeConfirmation}
        onConfirm={confirmDownload}
      />
      <DeleteBookAudioDialog
        bookName={deleting ? title(deleting.book) : null}
        english={locale === "en"}
        busy={busy}
        error={dialogError}
        onClose={closeDeletion}
        onConfirm={confirmDeletion}
      />
    </>
  );
}
