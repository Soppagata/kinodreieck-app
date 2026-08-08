import { useCallback, useRef, useState } from "react";

/* Sichtbarer Masterstand und seine synchronen Refs gehören zusammen. Die
   Persistenzqueue committed ausschließlich über diese eine Grenze. */
export function useMasterStateController() {
  const [master, setMaster] = useState(null);
  const [masterMeta, setMasterMeta] = useState(null);
  const [masterHerkunft, setMasterHerkunft] = useState(null);
  const masterRef = useRef(master), masterMetaRef = useRef(masterMeta);
  const masterHerkunftRef = useRef(masterHerkunft);
  masterRef.current = master;
  masterMetaRef.current = masterMeta;
  masterHerkunftRef.current = masterHerkunft;
  const commitMaster = useCallback(({ master: next, meta, herkunft }) => {
    masterRef.current = next.length ? next : null;
    masterMetaRef.current = next.length ? meta : null;
    masterHerkunftRef.current = next.length ? herkunft : null;
    setMaster(next.length ? next : null);
    setMasterMeta(next.length ? meta : null);
    setMasterHerkunft(next.length ? herkunft : null);
  }, []);
  return {
    master, setMaster, masterRef,
    masterMeta, setMasterMeta, masterMetaRef,
    masterHerkunft, setMasterHerkunft, masterHerkunftRef,
    commitMaster,
  };
}
