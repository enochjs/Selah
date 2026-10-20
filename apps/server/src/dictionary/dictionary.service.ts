import { HttpException, Inject, Injectable } from "@nestjs/common";
import { pageOf, PageQuery } from "../common/pagination.dto";
import { State } from "../domain/models";
import { ContentRepository } from "../infrastructure/content.repository";
import { StateRepository } from "../infrastructure/state.repository";
import { DeleteWordDto, RevisionDto, SaveWordDto } from "./dictionary.dto";

@Injectable()
export class DictionaryService {
  constructor(
    @Inject(StateRepository) private readonly store: StateRepository,
    @Inject(ContentRepository) private readonly content: ContentRepository,
  ) {}
  list(query: PageQuery) {
    const state = this.store.get(),
      q = query.q.trim().toLowerCase();
    return {
      ...pageOf(
        Object.entries(state.dictionary)
          .map(([word, entry]) => ({ word, ...entry }))
          .filter(
            (row) =>
              !q ||
              `${row.word} ${row.meaning} ${row.phonetic}`
                .toLowerCase()
                .includes(q),
          )
          .sort((a, b) => a.word.localeCompare(b.word)),
        query,
      ),
      revision: state.revision,
      dirty: state.revision !== state.publishedRevision,
    };
  }
  private revision(revision: number, state: State) {
    if (revision !== state.revision)
      throw new HttpException("数据已被更新，请刷新后重新操作", 409);
  }
  private word(value: string) {
    const word = value.trim().toLowerCase();
    if (
      !/^[a-z]+(?:[' -][a-z]+)*$/.test(word) ||
      ["constructor", "prototype"].includes(word)
    )
      throw new HttpException("单词仅支持英文字母、空格、连字符和撇号", 400);
    return word;
  }
  async save(body: SaveWordDto, actor: string) {
    const word = this.word(body.word);
    const revision = await this.store.update(
      "dictionary.save",
      actor,
      word,
      (next) => {
        this.revision(body.revision, next);
        next.dictionary[word] = {
          meaning: body.meaning.trim(),
          phonetic: body.phonetic.trim(),
          type: body.type.trim(),
        };
        return ++next.revision;
      },
    );
    return { ok: true, revision };
  }
  async delete(body: DeleteWordDto, actor: string) {
    const word = this.word(body.word);
    const revision = await this.store.update(
      "dictionary.delete",
      actor,
      word,
      (next) => {
        this.revision(body.revision, next);
        if (!Object.hasOwn(next.dictionary, word))
          throw new HttpException("单词不存在", 404);
        delete next.dictionary[word];
        return ++next.revision;
      },
    );
    return { ok: true, revision };
  }
  async publish(body: RevisionDto, actor: string) {
    const backup = await this.store.update(
      "dictionary.publish",
      actor,
      "App 内置词典",
      async (next) => {
        this.revision(body.revision, next);
        const name = await this.content.publishDictionary(
          next.dictionary,
          next.revision,
        );
        next.publishedRevision = next.revision;
        return name;
      },
    );
    return { ok: true, backup };
  }
}
