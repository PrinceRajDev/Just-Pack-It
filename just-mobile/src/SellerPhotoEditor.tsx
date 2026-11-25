import { useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import { launchImageLibraryAsync, type ImagePickerAsset } from "expo-image-picker";
import { byteLength, toByteArray } from "base64-js";
import { resolveImage } from "./images";
import { sellerApi, type ImageUploadCapability } from "./sellerApi";
import { LoadState, MutationFeedback, SellerButton, SellerCard, styles, useSellerData, useSellerMutation } from "./SellerWorkspaceUI";

export function photoBody(asset:ImagePickerAsset, limits:ImageUploadCapability) {
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

export function SellerPhotoEditor({token,image,shopCover,onUpload,onRefresh,onBusy}:{token:string;image?:string;shopCover?:boolean;
  onUpload:(body:ArrayBuffer,type:string)=>Promise<void>;onRefresh:()=>Promise<void>;onBusy:(active:boolean)=>void}) {
  const capability = useSellerData(() => sellerApi.photoCapability(token),token);
  const mutation = useSellerMutation();
  const picking = useRef(false);
  const [asset,setAsset] = useState<ImagePickerAsset>();
  const [pickError,setPickError] = useState("");
  const [uploaded,setUploaded] = useState(false);
  const preview = asset?.uri || resolveImage(image);
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
      await onUpload(buffer,type);
      setUploaded(true);
      setAsset(undefined);
    } finally { onBusy(false); }
  });
  return <SellerCard>
    <Text accessibilityRole="header" style={styles.section}>{shopCover ? "Shop cover photo" : "Product photo"}</Text>
    {preview ? (
      <View style={styles.workGroup}>
        <Text style={styles.label}>{asset ? "Selected photo" : "Current photo"}</Text>
        <Image accessibilityLabel={asset ? "Selected photo preview" : shopCover ? "Current shop cover photo" : "Current product photo"}
          source={{uri:preview}} style={styles.productPhotoPreview} resizeMode="contain" />
        {asset && <Text style={styles.copy}>Preview only. {shopCover ? "Submit the cover to send it for review." : "Upload the photo to update your listing."}</Text>}
      </View>
    ) : (
      <View style={styles.dispatchRoute}>
        <Text style={styles.label}>{shopCover ? "No custom cover yet" : "No product photo yet"}</Text>
      </View>
    )}
    <LoadState loading={capability.loading && !capability.data} error={capability.error} retry={capability.reload} />
    {capability.data?.enabled === false && <Text style={styles.copy}>Photo uploads are unavailable right now.</Text>}
    {!!pickError && <MutationFeedback error={pickError} />}
    <MutationFeedback error={mutation.error} onReload={() => void mutation.run(async () => {
      onBusy(true);
      try { await onRefresh(); } finally { onBusy(false); }
    })} />
    {uploaded && <Text accessibilityLiveRegion="polite" style={styles.catalogueNotice}>{shopCover ? "Cover photo submitted for review." : "Product photo saved."}</Text>}
    {capability.data?.enabled && <>
      <Text style={styles.copy}>JPEG, PNG or WebP · Up to {Math.floor(capability.data.maxBytes / (1024 * 1024))} MB</Text>
      {shopCover && <Text style={styles.copy}>Uploading a new cover sends your shop back for approval. It may temporarily disappear from the marketplace during review.</Text>}
      {asset && <SellerButton label={shopCover ? "Submit cover for review" : "Upload photo"} disabled={mutation.busy} onPress={upload} />}
      <SellerButton label={asset ? "Choose another photo" : image ? "Replace photo" : "Choose photo"} soft={!!asset} disabled={mutation.busy} onPress={() => void choose()} />
      {asset && <SellerButton label="Discard selected photo" soft disabled={mutation.busy} onPress={() => { setAsset(undefined); setPickError(""); mutation.clear(); }} />}
    </>}
  </SellerCard>;
}
