import { useRef, useState } from "react";
import { Image, Text } from "react-native";
import { launchImageLibraryAsync, type ImagePickerAsset } from "expo-image-picker";
import { byteLength, toByteArray } from "base64-js";
import { resolveImage } from "./images";
import { sellerApi, type ImageUploadCapability, type SellerProduct } from "./sellerApi";
import { LoadState, MutationFeedback, SellerButton, SellerCard, styles, useSellerData, useSellerMutation } from "./SellerWorkspaceUI";

function photoBody(asset:ImagePickerAsset, limits:ImageUploadCapability) {
  const encoded = asset.base64;
  if (!encoded) throw new Error("Could not read this photo. Choose another image.");
  const maxMb = Math.floor(limits.maxBytes / (1024 * 1024));
  if (byteLength(encoded) > limits.maxBytes) throw new Error(`Choose a photo up to ${maxMb} MB.`);
  const bytes = toByteArray(encoded);
  const signature = String.fromCharCode(...bytes.subarray(0,12));
  const type = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
    : signature.startsWith("\x89PNG\r\n\x1a\n") ? "image/png"
    : signature.startsWith("RIFF") && signature.slice(8) === "WEBP" ? "image/webp" : "";
  if (!type || !limits.types.includes(type)) throw new Error("Choose a JPEG, PNG or WebP photo.");
  return {buffer:bytes.buffer as ArrayBuffer,type};
}

export function SellerProductPhoto({token,product,onSaved,onRefresh,onBusy}:{token:string;product:SellerProduct;
  onSaved:(value:SellerProduct)=>void;onRefresh:()=>Promise<void>;onBusy:(active:boolean)=>void}) {
  const capability = useSellerData(() => sellerApi.photoCapability(token),token);
  const mutation = useSellerMutation();
  const picking = useRef(false);
  const [asset,setAsset] = useState<ImagePickerAsset>();
  const [pickError,setPickError] = useState("");
  const [uploaded,setUploaded] = useState(false);
  const preview = asset?.uri || resolveImage(product.image);
  const choose = async () => {
    if (picking.current || !capability.data?.enabled) return;
    picking.current = true;
    onBusy(true);
    setPickError("");
    mutation.clear();
    try {
      const result = await launchImageLibraryAsync({mediaTypes:["images"],quality:0.85,base64:true});
      if (result.canceled) return;
      photoBody(result.assets[0],capability.data);
      setAsset(result.assets[0]);
      setUploaded(false);
    } catch (reason) {
      setPickError(reason instanceof Error ? reason.message : "Could not open your photo library.");
    } finally {
      picking.current = false;
      onBusy(false);
    }
  };
  const upload = () => void mutation.run(async () => {
    if (!asset || !capability.data?.enabled) return;
    onBusy(true);
    try {
      const {buffer,type} = photoBody(asset,capability.data);
      const updated = await sellerApi.uploadProductPhoto(token,product,buffer,type);
      onSaved(updated);
      setUploaded(true);
      setAsset(undefined);
    } finally { onBusy(false); }
  });
  return <SellerCard>
    <Text accessibilityRole="header" style={styles.section}>Product photo</Text>
    {preview && <Image accessibilityLabel={asset ? "Selected photo preview" : "Current product photo"}
      source={{uri:preview}} style={styles.productPhotoPreview} resizeMode="contain" />}
    <LoadState loading={capability.loading && !capability.data} error={capability.error} retry={capability.reload} />
    {capability.data?.enabled === false && <Text style={styles.copy}>Photo uploads are unavailable right now.</Text>}
    {!!pickError && <MutationFeedback error={pickError} />}
    <MutationFeedback error={mutation.error} onReload={() => void mutation.run(async () => {
      onBusy(true);
      try { await onRefresh(); } finally { onBusy(false); }
    })} />
    {uploaded && <Text accessibilityLiveRegion="polite" style={styles.catalogueNotice}>Product photo saved.</Text>}
    {capability.data?.enabled && <>
      <Text style={styles.copy}>JPEG, PNG or WebP · Up to {Math.floor(capability.data.maxBytes / (1024 * 1024))} MB</Text>
      <SellerButton label={asset ? "Choose another photo" : product.image ? "Replace photo" : "Choose photo"} soft disabled={mutation.busy} onPress={() => void choose()} />
      {asset && <>
        <SellerButton label="Upload photo" disabled={mutation.busy} onPress={upload} />
        <SellerButton label="Discard selected photo" soft disabled={mutation.busy} onPress={() => { setAsset(undefined); setPickError(""); mutation.clear(); }} />
      </>}
    </>}
  </SellerCard>;
}
