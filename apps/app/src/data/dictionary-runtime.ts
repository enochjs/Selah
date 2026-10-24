import AsyncStorage from "@react-native-async-storage/async-storage";
import { DictionaryLookup } from "../domain/dictionary";
import { lookupOffline } from "./dictionary";
import { lookupOnline } from "./dictionary-online";

export const dictionaryLookup = new DictionaryLookup({
  offline: lookupOffline,
  online: lookupOnline,
  storage: AsyncStorage,
});
