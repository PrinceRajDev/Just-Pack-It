import { theme } from "./theme";
import { useEffect, useState } from "react";
import { shopHoursLabel, validTime } from "./shopHours";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { marketApi } from "./api";
import { BuyerStateCard } from "./BuyerStateCard";
import { resolveImage } from "./images";
import { fulfilmentNames, sellerApi, type Fulfilment, type SellerProduct, type SellerShop } from "./sellerApi";
import { sellerShopApproval, rupees, styles, LoadState, MutationFeedback, Row, SellerButton, SellerCard, SellerField, SellerScroll, useSellerData, useSellerMutation, useSellerPages } from "./SellerWorkspaceUI";
import { useAndroidBack } from "./useAndroidBack";
import { SellerPhotoEditor } from "./SellerPhotoEditor";
import { AndroidPushSettings } from "./AndroidPushSettings";

const filterGroups = [
  { label: "Availability", filters: ["All", "Active", "Inactive"] },
  { label: "Needs attention", filters: ["Low stock", "Out of stock", "No photo"] },
] as const;
type CatalogueFilter = (typeof filterGroups)[number]["filters"][number];
const shelfPhoto = require("../assets/browse-categories/grocery.webp");
const productIcon = require("../assets/nav-icons/bag.png");
const productSections = ["Details","Pack variants","Photo"] as const;
const isLowStock = (stock: number) => stock > 0 && stock <= 5;

function stockLevels(item: SellerProduct) {
  return item.variants?.length ? item.variants.map(option => option.stock) : [item.stock];
}

function matchesCatalogueFilter(item: SellerProduct, filter: CatalogueFilter) {
  switch (filter) {
    case "All": return true;
    case "Active": return item.active;
    case "Inactive": return !item.active;
    case "Low stock": return item.active && stockLevels(item).some(isLowStock);
    case "Out of stock": return item.active && stockLevels(item).some(stock => stock === 0);
    case "No photo": return !item.image?.trim();
  }
}

export type StockFilter = "Low stock" | "Out of stock";

export function SellerCatalogue({token,stockFilter}:{token:string;stockFilter?:StockFilter}) {
  const listing = useSellerPages(sellerApi.products,token);
  const [query,setQuery] = useState("");
  const [filter,setFilter] = useState<CatalogueFilter>(stockFilter ?? "All");
  const [edit,setEdit] = useState<SellerProduct | "new">();
  const [editorSection,setEditorSection] = useState<typeof productSections[number]>("Details");
  const [packExpansion,setPackExpansion] = useState<Record<string,boolean>>({});
  const [stockProduct,setStockProduct] = useState<SellerProduct>();
  const [savedStockId,setSavedStockId] = useState<string>();
  const open = useSellerMutation();
  const leaveEditor = () => { setEdit(undefined); setEditorSection("Details"); };
  const stockSaved = (updated: SellerProduct) => {
    listing.setData(previous => previous && {...previous,items:previous.items.map(item => item.id === updated.id ? updated : item)});
    setSavedStockId(updated.id);
  };
  if (edit) return <ProductEditor token={token} product={edit==="new" ? undefined : edit} initialSection={editorSection} close={leaveEditor} saved={listing.reload} stockSaved={stockSaved} />;
  if (stockProduct) return <QuickStock token={token} product={stockProduct} close={() => setStockProduct(undefined)}
    reload={() => sellerApi.product(token,stockProduct.id)} saved={updated => {
      stockSaved(updated);
      setStockProduct(undefined);
    }} />;
  const term = query.trim().toLowerCase();
  const words = term.split(/\s+/);
  const matching = listing.data?.items.filter(item => {
    const packs = [item.unit,...(item.variants ?? []).map(variant => variant.label)];
    return packs.some(pack => {
      const label = `${item.name} ${pack ?? ""}`.toLowerCase();
      return words.every(word => label.includes(word));
    });
  });
  const rows = matching?.filter(item => item.id === savedStockId || matchesCatalogueFilter(item,filter));
  return <SellerScroll refreshing={listing.loading} onRefresh={listing.reload}>
    <View style={styles.catalogueHero}>
      <View style={styles.catalogueHeroCopy}>
        <Text accessibilityRole="header" style={styles.heroTitle}>Shop shelves</Text>
        {listing.data && <Text style={styles.heroKicker}>{listing.data.items.length}{listing.data.next ? "+" : ""} {listing.data.items.length === 1 && !listing.data.next ? "product" : "products"}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="Add product" onPress={() => setEdit("new")} style={({pressed}) => [styles.catalogueAdd,pressed && styles.pressed]}>
          <Text style={[styles.label, styles.onPrimary]}>＋ Add product</Text>
        </Pressable>
      </View>
      <Image source={shelfPhoto} resizeMode="cover" style={styles.catalogueHeroPhoto} accessible={false} />
    </View>
    <View style={styles.catalogueFilters}>
      <View style={styles.catalogueSearch}>
        <TextInput accessibilityLabel="Search products" placeholder="Search by name or pack size" placeholderTextColor={theme.secondary} value={query} onChangeText={setQuery} returnKeyType="search" style={styles.catalogueSearchInput} />
        {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear product search" onPress={() => setQuery("")} style={styles.catalogueAction}><Text style={styles.link}>Clear</Text></Pressable>}
      </View>
      {filterGroups.map(group => (
        <View key={group.label} style={styles.workGroup}>
          <Text accessibilityRole="header" style={styles.workGroupTitle}>{group.label}</Text>
          <View style={styles.chips}>{group.filters.map(value => {
            const selected = value === filter;
            const count = value === "Low stock" || value === "Out of stock" || value === "No photo"
              ? matching?.filter(item => matchesCatalogueFilter(item, value)).length : undefined;
            return (
              <Pressable key={value} accessibilityRole="tab" accessibilityLabel={value}
                accessibilityHint={count === undefined ? undefined : `${count} matching products loaded`}
                accessibilityState={{selected}} style={[styles.chip, styles.catalogueChip, selected && styles.catalogueSelectedFilter]} onPress={() => { setFilter(value); setSavedStockId(undefined); setPackExpansion({}); }}>
                <Text style={selected ? styles.dispatchModeTextActive : styles.link}>{value}{count === undefined ? "" : ` · ${count}`}</Text>
              </Pressable>
            );
          })}</View>
        </View>
      ))}
      {listing.data?.next && <Text style={styles.copy}>Counts reflect loaded products.</Text>}
    </View>
    <View style={styles.orderTop}>
      <View style={styles.grow}>
        <Text accessibilityRole="header" style={styles.section}>{filter === "All" ? "Products" : filter}</Text>
        {rows && !!term && !listing.error && <Text style={styles.copy}>{rows.length} {rows.length === 1 ? "match" : "matches"}{listing.data?.next ? " in loaded products" : ""}</Text>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh catalogue" disabled={listing.loading} onPress={listing.reload} style={styles.dispatchRefresh}><Text style={styles.link}>{listing.loading ? "Refreshing…" : "Refresh"}</Text></Pressable>
    </View>
    <LoadState error={listing.error} loading={listing.loading&&!listing.data} retry={listing.reload} />
    <MutationFeedback error={open.error} />
    {!listing.loading && !listing.error && !rows?.length && <BuyerStateCard title="No products in this view"
      copy={listing.data?.next ? "Load more products to check the rest of your catalogue." : "Add a product or try a different search or filter."}
      icon="bag" action={term || filter !== "All" ? "Reset filters" : undefined}
      onAction={() => { setQuery(""); setFilter("All"); }} />}
    {rows?.map(item => <CatalogueProduct key={item.id} item={item} stockSaved={item.id === savedStockId} disabled={open.busy}
      packsExpanded={packExpansion[item.id] ?? filter === "Low stock"}
      highlightLowStock={filter === "Low stock"}
      onTogglePacks={() => setPackExpansion(previous => ({...previous,[item.id]:!(previous[item.id] ?? filter === "Low stock")}))}
      reload={listing.reload}
      onPackStock={async (product,packId,quantity) => {
        const {version,...pack} = await sellerApi.variantStock(token,product,packId,quantity);
        stockSaved({...product,version,variants:product.variants?.map(option => option.id === packId ? pack : option)});
      }}
      onPress={() => void open.run(async () => { setEdit(await sellerApi.product(token,item.id)); })}
      onPhoto={() => void open.run(async () => {
        const current = await sellerApi.product(token,item.id);
        setEditorSection("Photo"); setEdit(current);
      })}
      onStock={() => void open.run(async () => {
        const current = await sellerApi.product(token,item.id);
        if (current.variants?.length) { setEditorSection("Pack variants"); setEdit(current); }
        else setStockProduct(current);
      })} />)}
    {listing.data?.next && <SellerButton label={listing.moreBusy?"Loading…":"Load more products"} soft disabled={listing.moreBusy} onPress={listing.more} />}
  </SellerScroll>;
}

function CatalogueProduct({item,stockSaved,disabled,packsExpanded,highlightLowStock,onTogglePacks,onPackStock,reload,onPress,onStock,onPhoto}:{
  item:SellerProduct;stockSaved:boolean;disabled:boolean;packsExpanded:boolean;highlightLowStock:boolean;
  onTogglePacks:()=>void;onPackStock:(product:SellerProduct,id:string,quantity:number)=>Promise<void>;reload:()=>void;
  onPress:()=>void;onStock:()=>void;onPhoto:()=>void;
}) {
  const [failedImage,setFailedImage] = useState("");
  const [draft,setDraft] = useState<{product:SellerProduct; id:string; quantity:string}>();
  const [savedPack,setSavedPack] = useState<string>();
  const mutation = useSellerMutation();
  const locked = disabled || mutation.busy;
  const image = resolveImage(item.image);
  const stocks = stockLevels(item);
  const empty = stocks.filter(stock => stock === 0).length;
  const low = stocks.some(isLowStock);
  const status = !item.active ? "Inactive" : empty === stocks.length ? "Out of stock" : empty > 0 ? "Some packs sold out" : low ? "Low stock" : "In stock";
  const stockLabel = `${stocks.reduce((sum, stock) => sum + stock, 0)} available${item.variants?.length ? ` across ${item.variants.length} options` : ""}`;
  const prices = item.variants?.length ? item.variants.map(option => option.price) : [item.price];
  const lowest = Math.min(...prices), highest = Math.max(...prices);
  const priceLabel = lowest === highest ? rupees(lowest) : `${rupees(lowest)}–${rupees(highest)}`;
  return <View style={styles.dispatchTicket} testID={`catalogue-product-${item.id}`}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} accessibilityHint={`${priceLabel}, ${stockLabel}, ${status}`} disabled={locked} onPress={onPress}
      style={({pressed})=>[styles.catalogueProductBody,pressed && styles.pressed]}>
      <View style={styles.catalogueThumb}>
        {image && image !== failedImage
          ? <Image source={{uri:image}} style={styles.catalogueThumbPhoto} resizeMode="cover" accessible={false} onError={() => setFailedImage(image)} />
          : <Image source={productIcon} resizeMode="contain" style={[styles.sellerIcon,styles.cataloguePlaceholder]} accessible={false} />}
      </View>
      <View style={styles.grow}>
        <Text style={styles.title}>{item.name}</Text>
        <Text style={styles.copy}>{[item.unit,stockLabel].filter(Boolean).join(" · ")}</Text>
        <Text style={styles.orderAmount}>{priceLabel}</Text>
        <Text style={[styles.orderStatus,!item.active && styles.catalogueInactive,(empty > 0 || low) && item.active && styles.workCountActive]}>{status}</Text>
      </View>
      <Text style={styles.link}>›</Text>
    </Pressable>
    <View style={styles.catalogueProductFooter}>
      <View style={styles.catalogueCardActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.image ? "Change" : "Add"} photo for ${item.name}`} disabled={locked} onPress={onPhoto} style={styles.cataloguePhotoAction}>
          <Text style={styles.link}>{item.image ? "Photo" : "Add photo"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Manage stock for ${item.name}`} disabled={locked} onPress={onStock} style={styles.catalogueAction}>
          <Text style={styles.link}>{item.variants?.length ? "Manage packs" : "Update stock"}</Text>
        </Pressable>
        {!!item.variants?.length && <Pressable accessibilityRole="button" disabled={locked} accessibilityState={{expanded:packsExpanded}} onPress={onTogglePacks} style={styles.catalogueAction}>
          <Text style={styles.link}>{packsExpanded ? "Hide packs" : "View packs"}</Text>
        </Pressable>}
      </View>
    </View>
    {packsExpanded && item.variants?.map(pack => {
      const lowStock = item.active && isLowStock(pack.stock);
      return <View key={pack.id} style={[styles.catalogueProductFooter,highlightLowStock && lowStock && styles.sage]}>
        <View style={styles.grow}>
          <Text style={styles.label}>{pack.label}</Text>
          <Text style={styles.copy}>{rupees(pack.price)} · {pack.stock} available</Text>
          {lowStock && <Text style={styles.label}>Low stock</Text>}
          {!pack.stock && <Text style={styles.copy}>Out of stock</Text>}
        </View>
        {draft?.id === pack.id ? <View style={{width:"100%",gap:8}}>
          <SellerField label={`Stock for ${pack.label}`} value={draft.quantity} keyboardType="number-pad" editable={!locked}
            onChangeText={quantity => setDraft({...draft,quantity})} />
          <MutationFeedback error={mutation.error} onReload={() => { setDraft(undefined); mutation.clear(); reload(); }} />
          <SellerButton label={mutation.busy ? "Saving stock…" : "Save stock"}
            disabled={locked || !validStock(draft.quantity) || Number(draft.quantity) === pack.stock}
            onPress={() => void mutation.run(async () => {
              await onPackStock(draft.product,pack.id,Number(draft.quantity));
              setDraft(undefined);
              setSavedPack(pack.id);
            })} />
          <SellerButton label="Cancel" soft disabled={locked} onPress={() => { setDraft(undefined); mutation.clear(); }} />
        </View> : <Pressable accessibilityRole="button" accessibilityLabel={`Update stock for ${item.name}, ${pack.label}`} disabled={locked}
          onPress={() => { mutation.clear(); setSavedPack(undefined); setDraft({product:item,id:pack.id,quantity:String(pack.stock)}); }}
          style={styles.catalogueAction}><Text style={styles.link}>Update stock</Text></Pressable>}
        {savedPack === pack.id && <Text accessibilityLiveRegion="polite" style={styles.catalogueNotice}>Stock updated</Text>}
      </View>;
    })}
    {stockSaved && !savedPack && <Text accessibilityLiveRegion="polite" style={styles.catalogueNotice}>{`Stock updated for ${item.name}.`}</Text>}
  </View>;
}

function QuickStock({token,product,close,saved,reload}:{token:string;product:SellerProduct;close:()=>void;saved:(product:SellerProduct)=>void;reload:()=>Promise<SellerProduct>}) {
  const [current,setCurrent] = useState(product);
  const [stock,setStock] = useState(String(product.stock));
  const mutation = useSellerMutation();
  const stockIsValid = validStock(stock);
  const quantity = stockIsValid ? Number(stock) : current.stock;
  const difference = quantity - current.stock;
  useAndroidBack(() => { if (!mutation.busy) close(); return true; }, 25);
  return <SellerScroll>
    <Pressable accessibilityRole="button" disabled={mutation.busy} onPress={close} style={styles.orderBack}><Text style={styles.link}>‹  Back to catalogue</Text></Pressable>
    <View style={styles.orderHero}>
      <Text style={styles.heroKicker}>Update stock</Text>
      <Text accessibilityRole="header" style={styles.heroTitle}>{current.name}</Text>
      {!current.variants?.length && <View style={styles.statementMetrics}>
        <View style={styles.grow}>
          <Text style={styles.statementMetric}>{current.stock}</Text>
          <Text style={styles.heroKicker}>Saved stock</Text>
        </View>
        <View style={styles.statementRule} />
        <View style={styles.grow}>
          <Text style={styles.statementMetric}>{stockIsValid ? quantity : "—"}</Text>
          <Text style={styles.heroKicker}>After saving</Text>
        </View>
      </View>}
    </View>
    <SellerCard>
      {!current.variants?.length && <>
        <SellerField label="Available units" value={stock} onChangeText={setStock} keyboardType="number-pad" selectTextOnFocus editable={!mutation.busy} />
        {!stockIsValid ? (
          <Text style={styles.shopHoursWarning}>Enter a whole number of units, including 0.</Text>
        ) : difference !== 0 ? (
          <Text style={styles.copy}>{difference > 0 ? "+" : "−"}{Math.abs(difference)} {Math.abs(difference) === 1 ? "unit" : "units"} after saving</Text>
        ) : null}
        <View style={styles.shopTimes}>
        <View style={styles.grow}><SellerButton label="− 1 unit" soft disabled={mutation.busy || quantity <= 0} onPress={() => setStock(String(quantity - 1))} /></View>
        <View style={styles.grow}><SellerButton label="+ 1 unit" soft disabled={mutation.busy || quantity >= Number.MAX_SAFE_INTEGER} onPress={() => setStock(String(quantity + 1))} /></View>
        </View>
      </>}
      <MutationFeedback error={mutation.error} onReload={() => void mutation.run(async () => {
        const fresh = await reload();
        setCurrent(fresh);
        setStock(String(fresh.stock));
      })} />
      {current.variants?.length ? <Text style={styles.copy}>This product now has packs. Go back and choose Manage packs.</Text>
        : <SellerButton label={mutation.busy ? "Saving…" : "Save stock"} disabled={mutation.busy || !stockIsValid || difference === 0}
          onPress={() => void mutation.run(async () => saved(await sellerApi.inventory(token,current,Number(stock))))} />}
    </SellerCard>
  </SellerScroll>;
}

function ProductEditor({token,product,initialSection,close,saved,stockSaved}:{token:string;product?:SellerProduct;initialSection:typeof productSections[number];close:()=>void;saved:()=>void;stockSaved:(product:SellerProduct)=>void}) {
  const [current,setCurrent] = useState(product);
  const [section,setSection] = useState(initialSection);
  const [offerPhoto,setOfferPhoto] = useState(false);
  const [photoBusy,setPhotoBusy] = useState(false);
  const [name,setName] = useState(product?.name ?? "");
  const [unit,setUnit] = useState(product?.unit ?? "");
  const [description,setDescription] = useState(product?.description ?? "");
  const [categoryId,setCategory] = useState(product?.categoryId ?? "");
  const [price,setPrice] = useState(product ? String(product.price) : "");
  const [mrp,setMrp] = useState(product?.mrp != null ? String(product.mrp) : "");
  const [stock,setStock] = useState(product ? String(product.stock) : "");
  const [isActive,setIsActive] = useState(product?.active ?? true);
  const [variant,setVariant] = useState<{id?:string;label:string;price:string;stock:string}>();
  const [notice,setNotice] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);
  const categories = useSellerData(marketApi.categories,token);
  const mutation = useSellerMutation();
  const hasVariants = !!current?.variants?.length;
  const detailsChanged = !current || name.trim() !== current.name.trim()
    || unit.trim() !== current.unit.trim()
    || description.trim() !== (current.description ?? "").trim()
    || categoryId !== current.categoryId
    || !validMoney(price) || Number(price) !== current.price
    || (mrp === "" ? null : Number(mrp)) !== (current.mrp ?? null)
    || (!hasVariants && (!validStock(stock) || Number(stock) !== current.stock))
    || isActive !== current.active;
  const draftStarted = current ? detailsChanged : Boolean(
    name.trim() || unit.trim() || description.trim() || categoryId || price || mrp || stock || !isActive
  );
  const savedVariant = variant?.id ? current?.variants?.find(item => item.id === variant.id) : undefined;
  const variantChanged = variant && (savedVariant
    ? variant.label.trim() !== savedVariant.label.trim() || variant.price !== String(savedVariant.price) || variant.stock !== String(savedVariant.stock)
    : Boolean(variant.label.trim() || variant.price || variant.stock));
  const requestExit = () => {
    if (mutation.busy || photoBusy) return;
    if (draftStarted || variantChanged) setConfirmExit(true);
    else close();
  };
  const discardDetails = () => {
    if (!current) return;
    setName(current.name);
    setUnit(current.unit);
    setDescription(current.description ?? "");
    setCategory(current.categoryId);
    setPrice(String(current.price));
    setMrp(current.mrp == null ? "" : String(current.mrp));
    setStock(String(current.stock));
    setIsActive(current.active);
    setNotice("");
    mutation.clear();
  };
  useAndroidBack(() => { if (confirmExit) setConfirmExit(false); else requestExit(); return true; }, 25);
  const refresh = async (confirmStock = false) => {
    if (!current) return;
    const next = await sellerApi.product(token,current.id);
    setCurrent(next); setStock(String(next.stock));
    if (confirmStock) stockSaved(next);
  };
  const save = () => void mutation.run(async () => {
    if (!name.trim() || !unit.trim() || !categoryId || !validMoney(price) || (!hasVariants && !validStock(stock)) || (mrp && (!validMoney(mrp) || Number(mrp)<Number(price)))) throw new Error("Enter a name, unit, category, valid price and whole-number stock. MRP must be at least the selling price.");
    const result = await sellerApi.saveProduct(token,{
      name:name.trim(),unit:unit.trim(),description:description.trim(),categoryId,price:Number(price),
      mrp:mrp ? Number(mrp) : null,stock:hasVariants ? current!.stock : Number(stock),active:isActive,
      ...(current && current.categoryId!==categoryId ? {subcategoryId:null} : {}),
    },current);
    if (!current && !result.image) setOfferPhoto(true);
    if (current && current.stock !== result.stock) stockSaved(result);
    else saved();
    setCurrent(result); setStock(String(result.stock)); setNotice("Product saved.");
  });
  const feedback = <MutationFeedback error={mutation.error} onReload={current ? ()=>void mutation.run(refresh) : undefined} />;
  return <>
  <SellerScroll>
    <Pressable accessibilityRole="button" onPress={requestExit} disabled={mutation.busy || photoBusy} style={styles.orderBack}><Text style={styles.link}>‹  Back to catalogue</Text></Pressable>
    <View style={styles.orderHero}>
      <View style={styles.orderTop}>
        <Image source={productIcon} resizeMode="contain" style={[styles.sellerIcon,styles.editorIcon]} accessible={false} />
        {current && <Text style={styles.orderStatus}>{current.active ? "Active listing" : "Inactive listing"}</Text>}
      </View>
      <Text accessibilityRole="header" style={styles.heroTitle}>{current?.name || "Add product"}</Text>
      {current && <Text style={styles.heroKicker}>{[current.unit,rupees(current.price)].filter(Boolean).join(" · ")}</Text>}
    </View>
    {current && <View style={styles.shopSections}>{productSections.map(value => (
      <Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:section===value}} disabled={mutation.busy || photoBusy} onPress={() => {
        setSection(value); setNotice(""); mutation.clear();
      }} style={[styles.shopSectionTab,section===value && styles.dispatchModeActive]}>
        <Text style={section===value ? styles.dispatchModeTextActive : styles.dispatchModeText}>{value}</Text>
      </Pressable>
    ))}</View>}
    {!current && <Text style={styles.copy}>Save the product to add a photo or pack variants.</Text>}
    {section === "Photo" && current && <SellerPhotoEditor token={token} image={current.image} onBusy={setPhotoBusy} onRefresh={refresh} onUpload={async (body,type) => {
      setCurrent(await sellerApi.uploadProductPhoto(token,current,body,type)); setOfferPhoto(false); saved();
    }} />}
    {section === "Details" && <>
    <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>Product details</Text>
      <SellerField label="Product name" value={name} onChangeText={setName} maxLength={100} />
      <SellerField label="Unit or pack size" value={unit} onChangeText={setUnit} maxLength={100} />
      <SellerField label="Description" value={description} onChangeText={setDescription} maxLength={2000} multiline />
      <Text style={styles.label}>Category</Text>
      <LoadState error={categories.error} loading={categories.loading&&!categories.data} retry={categories.reload}/>
      <View style={styles.chips}>{categories.data?.map(item => <Pressable accessibilityRole="radio" accessibilityState={{checked:categoryId===item.id}} key={item.id} onPress={() => setCategory(item.id)} style={[styles.chip,categoryId===item.id && styles.sage]}><Text style={styles.link}>{item.name}</Text></Pressable>)}</View>
    </SellerCard>
    <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>Pricing and stock</Text>
      <View style={styles.shopTimes}>
        <View style={styles.grow}><SellerField label="Price (₹)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" /></View>
        <View style={styles.grow}><SellerField label="MRP (₹), optional" value={mrp} onChangeText={setMrp} keyboardType="decimal-pad" /></View>
      </View>
      {!hasVariants && <SellerField label="Stock" value={stock} onChangeText={setStock} keyboardType="number-pad" />}
      {current && !hasVariants && <SellerButton label="Update stock only" soft disabled={mutation.busy} onPress={() => void mutation.run(async () => {
        if (!validStock(stock)) throw new Error("Enter a whole number of units.");
        const updated = await sellerApi.inventory(token,current,Number(stock));
        setCurrent(updated); setStock(String(updated.stock)); stockSaved(updated); setNotice("Stock updated.");
      })} />}
    </SellerCard>
    <View style={styles.shopAvailability}>
      <View style={styles.grow}><Text style={styles.title}>Listing visibility</Text><Text style={styles.copy}>{isActive ? "Active" : "Inactive"} after saving</Text></View>
      <Pressable accessibilityRole="switch" accessibilityLabel="Listing active" accessibilityState={{checked:isActive}} disabled={mutation.busy} onPress={() => setIsActive(value=>!value)} style={styles.shopSwitch}>
        <View style={[styles.shopSwitchTrack,isActive && styles.shopSwitchActive]}><View style={styles.shopSwitchKnob} /></View>
      </Pressable>
    </View>
    </>}
    {section === "Pack variants" && current && <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>Pack variants</Text>
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.catalogueNotice}>{notice}</Text>}
      {feedback}
      {!current.variants?.length && !variant && <Text style={styles.copy}>Add a pack when you sell this product in more than one size.</Text>}
      {current.variants?.map(item => <Row key={item.id} title={item.label} detail={`${rupees(item.price)} · ${item.stock}`} onPress={() => setVariant({id:item.id,label:item.label,price:String(item.price),stock:String(item.stock)})} />)}
      {!variant && <SellerButton label="Add variant" soft onPress={() => setVariant({label:"",price:"",stock:""})} />}
      {variant && <>
        <SellerField label="Pack label" value={variant.label} onChangeText={label=>setVariant({...variant,label})}/>
        <SellerField label="Variant price (₹)" value={variant.price} onChangeText={price=>setVariant({...variant,price})} keyboardType="decimal-pad"/>
        <SellerField label="Variant stock" value={variant.stock} onChangeText={stock=>setVariant({...variant,stock})} keyboardType="number-pad"/>
        <SellerButton label="Save variant" disabled={mutation.busy} onPress={() => void mutation.run(async () => {
          if (!variant.label.trim() || !validMoney(variant.price) || !validStock(variant.stock)) throw new Error("Enter a pack label, valid price and whole-number stock.");
          await sellerApi.variant(token,current,{label:variant.label.trim(),price:Number(variant.price),stock:Number(variant.stock)},variant.id);
          setVariant(undefined);
          const stockChanged = !savedVariant || savedVariant.stock !== Number(variant.stock);
          await refresh(stockChanged);
          if (!stockChanged) saved();
          setNotice("Variant saved.");
        })} />
        <SellerButton label="Close variant editor" soft disabled={mutation.busy} onPress={() => setVariant(undefined)} />
      </>}
    </SellerCard>}
  </SellerScroll>
  {confirmExit ? (
    <View style={styles.orderDock}>
      <Text accessibilityRole="header" style={styles.title}>Leave without saving?</Text>
      <Text style={styles.copy}>Unsaved edits to this product will be lost.</Text>
      <View style={styles.shopTimes}>
        <View style={styles.grow}><SellerButton label="Keep editing" soft onPress={() => setConfirmExit(false)} /></View>
        <View style={styles.grow}><SellerButton label="Discard and leave" onPress={close} /></View>
      </View>
    </View>
  ) : section === "Details" && <View style={styles.orderDock}>
    {feedback}
    {(!!notice || (!!current && detailsChanged)) && <Text accessibilityLiveRegion="polite" style={styles.shopSaved}>
      {current && detailsChanged ? "Unsaved product changes." : notice}
    </Text>}
    <View style={styles.shopTimes}>
      {current && detailsChanged && <View style={styles.grow}><SellerButton label="Discard changes" soft disabled={mutation.busy} onPress={discardDetails} /></View>}
      {offerPhoto && !detailsChanged && <View style={styles.grow}><SellerButton label="Add photo" soft disabled={mutation.busy} onPress={() => {
        setSection("Photo"); setNotice(""); mutation.clear();
      }} /></View>}
      <View style={styles.grow}><SellerButton label="Save product" disabled={mutation.busy || !detailsChanged} onPress={save} /></View>
    </View>
  </View>}
  </>;
}

const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const shopSections = ["Availability","Shop details","Cover photo","Account"] as const;
const shopCover = require("../assets/seller-storefront.jpg");

function overlappingHours(hours: SellerShop["openingHours"]) {
  const minutes = (time: string) => Number(time.slice(0,2)) * 60 + Number(time.slice(3));
  const slots = hours.flatMap(({day,opens,closes}) => {
    if (!validTime(opens) || !validTime(closes) || opens === closes) return [];
    const start = minutes(opens);
    const end = minutes(closes);
    return start < end ? [{day,start,end}] : [
      {day,start,end:1440},
      ...end > 0 ? [{day:(day + 1) % 7,start:0,end}] : [],
    ];
  });
  return slots.some((slot,index) => slots.slice(index + 1).some(other =>
    slot.day === other.day && slot.start < other.end && other.start < slot.end));
}

export function SellerShopSettings({token,name,signOut}:{token:string;name:string;signOut:()=>Promise<void>}) {
  const data = useSellerData(() => sellerApi.shop(token),token);
  if (data.data) return <ShopEditor key={data.data.id} token={token} shop={data.data} accountName={name} signOut={signOut} onSaved={data.setData} reload={data.reload} />;
  return <SellerScroll>
    <LoadState error={data.error} loading={data.loading} retry={data.reload}/>
    {!!data.error && <SellerAccountCard name={name} signOut={signOut} />}
  </SellerScroll>;
}

function ShopEditor({token,shop,accountName,signOut,onSaved,reload}:{token:string;shop:SellerShop;accountName:string;signOut:()=>Promise<void>;onSaved:(value:SellerShop)=>void;reload:()=>void}) {
  const [section,setSection] = useState<typeof shopSections[number]>("Availability");
  const [notice,setNotice] = useState("");
  const [failedCover,setFailedCover] = useState("");
  const [coverBusy,setCoverBusy] = useState(false);
  const [name,setName] = useState(shop.name);
  const [address,setAddress] = useState(shop.address ?? "");
  const [description,setDescription] = useState(shop.description ?? "");
  const [closed,setClosed] = useState(!!shop.temporarilyClosed);
  const [hours,setHours] = useState(shop.openingHours ?? []);
  const [now,setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  const [methods,setMethods] = useState(shop.fulfilment ?? []);
  const [pickupNote,setPickupNote] = useState(shop.pickupNote ?? "");
  const mutation = useSellerMutation();
  const cover = resolveImage(shop.coverImage);
  const profileChanged = name.trim() !== shop.name.trim()
    || address.trim() !== (shop.address ?? "").trim()
    || description.trim() !== (shop.description ?? "").trim();
  const pauseChanged = closed !== !!shop.temporarilyClosed;
  const hoursChanged = JSON.stringify(hours) !== JSON.stringify(shop.openingHours ?? []);
  const formatAvailability = (openingHours: SellerShop["openingHours"], temporarilyClosed?: boolean) => {
    if (shop.status !== "approved") return sellerShopApproval[shop.status];
    if (shop.active === false) return "Shop is inactive";
    return shopHoursLabel({openingHours, temporarilyClosed, timezone:shop.timezone || "Asia/Kolkata"}, now);
  };
  const savedMethods = shop.fulfilment ?? [];
  const scheduledDays = new Set(hours.map(row => row.day)).size;
  const availabilityChanged = pauseChanged
    || hoursChanged
    || methods.length !== savedMethods.length
    || methods.some(method => !savedMethods.includes(method))
    || pickupNote.trim() !== (shop.pickupNote ?? "").trim();
  return <>
    <SellerScroll>
    <View style={styles.hero}>
      <Image accessible={false} testID="seller-shop-cover" source={cover && cover !== failedCover ? {uri:cover} : shopCover}
        onError={() => { if (cover) setFailedCover(cover); }} style={styles.shopCover} resizeMode="cover" />
      <View style={styles.heroTop}>
        <View style={styles.grow}>
          <Text accessibilityRole="header" style={styles.heroTitle}>{shop.name}</Text>
          <Text style={styles.heroKicker}>{shop.locality || shop.address || "Shop settings"}</Text>
        </View>
        <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>{sellerShopApproval[shop.status]}</Text></View>
      </View>
    </View>
    <View style={styles.shopSections}>{shopSections.map(value => {
      const selected = section === value;
      return <Pressable key={value} accessibilityRole="tab" accessibilityState={{selected}} disabled={mutation.busy || coverBusy} onPress={() => {
        setSection(value); setNotice(""); mutation.clear();
      }} style={[styles.shopSectionTab,selected && styles.dispatchModeActive]}>
        <Text style={selected ? styles.dispatchModeTextActive : styles.dispatchModeText}>{value}</Text>
      </Pressable>;
    })}</View>
    {section !== "Availability" && <MutationFeedback error={mutation.error} onReload={reload} />}
    {section === "Shop details" && (profileChanged || !!notice) && <Text accessibilityLiveRegion="polite" style={styles.catalogueNotice}>
      {profileChanged ? "Unsaved shop details." : notice}
    </Text>}
    {section === "Shop details" && <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>Shop profile</Text>
      {shop.review?.reason && <Text style={styles.copy}>{shop.review.reason}</Text>}
      <SellerField label="Shop name" value={name} onChangeText={setName} maxLength={100} />
      <SellerField label="Street address" value={address} onChangeText={setAddress} maxLength={500} />
      <SellerField label="Shop description" value={description} onChangeText={setDescription} maxLength={1000} multiline />
      {profileChanged && <SellerButton label="Discard changes" soft disabled={mutation.busy} onPress={() => {
        setName(shop.name); setAddress(shop.address ?? ""); setDescription(shop.description ?? "");
        setNotice(""); mutation.clear();
      }} />}
      <SellerButton label="Save shop details" disabled={mutation.busy || !profileChanged} onPress={() => void mutation.run(async () => {
        if (name.trim().length<2 || address.trim().length<2) throw new Error("Enter the shop name and street address.");
        const updated = await sellerApi.saveProfile(token,shop,{name:name.trim(),address:address.trim(),description:description.trim()});
        onSaved(updated);
        setName(updated.name); setAddress(updated.address ?? ""); setDescription(updated.description ?? "");
        setNotice("Shop details saved.");
      })} />
    </SellerCard>}
    {section === "Cover photo" && <SellerPhotoEditor token={token} image={shop.coverImage} shopCover onBusy={setCoverBusy}
      onRefresh={async () => onSaved(await sellerApi.shop(token))} onUpload={async (body,type) => {
        const uploaded = await sellerApi.uploadShopCover(token,shop,body,type);
        onSaved({...shop,coverImage:uploaded.coverImage,status:uploaded.status,version:uploaded.version});
      }} />}
    {section === "Availability" && <>
    <SellerCard>
      <View style={styles.orderTop}>
        <Text accessibilityRole="header" style={[styles.section, styles.grow]}>Shop availability</Text>
        <Text style={styles.orderStatus}>{formatAvailability(shop.openingHours ?? [], shop.temporarilyClosed)}</Text>
      </View>
      <View style={[styles.shopAvailability, closed && styles.shopPauseActive]}>
        <View style={styles.grow}>
          <Text style={styles.title}>Pause shop temporarily</Text>
          <Text style={styles.copy}>
            {pauseChanged ? `Save availability to ${closed ? "pause" : "resume"} your shop.` : closed ? "Turn off the pause to follow your opening hours again." : "Pause the shop without changing your regular hours."}
          </Text>
        </View>
        <Pressable accessibilityRole="switch" accessibilityLabel="Pause shop temporarily" aria-checked={closed} accessibilityState={{checked:closed}} disabled={mutation.busy}
          onPress={() => {setClosed(value=>!value);setNotice("");}} style={styles.shopSwitch}>
          <View style={[styles.shopSwitchTrack,closed && styles.shopSwitchActive]}><View style={styles.shopSwitchKnob} /></View>
        </Pressable>
      </View>
    </SellerCard>
    <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>Opening hours</Text>
      <Text style={styles.copy}>24-hour time · {shop.timezone || "Asia/Kolkata"}</Text>
      <View style={styles.shopAvailability} testID="seller-hours-preview">
        <View style={styles.grow}>
          <Text style={styles.label}>Buyer preview</Text>
          <Text accessibilityLiveRegion="polite" style={styles.title}>{formatAvailability(hours, closed)}</Text>
          {(hoursChanged || pauseChanged) && <Text style={styles.copy}>Preview of unsaved changes</Text>}
        </View>
      </View>
      {scheduledDays > 0 && <Text style={styles.copy}>Scheduled on {scheduledDays} {scheduledDays === 1 ? "day" : "days"} per week</Text>}
      {overlappingHours(hours) && <Text accessibilityLiveRegion="polite" style={styles.shopHoursWarning}>Some opening hours overlap. Check the time slots below.</Text>}
      {!hours.length && <Text style={styles.copy}>No opening hours set.</Text>}
      {hours.map((row,index) => <View key={index} style={styles.shopInterval}>
        <View style={styles.orderTop}><Text style={styles.label}>{days[row.day]}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove interval for ${days[row.day]}`} disabled={mutation.busy} onPress={()=>setHours(old=>old.filter((_,i)=>i!==index))} style={styles.orderBack}><Text style={styles.link}>Remove</Text></Pressable>
        </View>
        <View style={styles.shopDays}>{days.map((day,dayIndex) => <Pressable key={day} accessibilityRole="radio" accessibilityLabel={day} accessibilityState={{checked:row.day===dayIndex}} disabled={mutation.busy} style={[styles.shopDay,row.day===dayIndex&&styles.sage]} onPress={()=>setHours(old=>old.map((item,i)=>i===index?{...item,day:dayIndex}:item))}><Text style={styles.eyebrow}>{day.slice(0,2)}</Text></Pressable>)}</View>
        <View style={styles.shopTimes}>
          <View style={styles.grow}><SellerField label="Opens (HH:MM)" editable={!mutation.busy} value={row.opens} onChangeText={opens=>setHours(old=>old.map((item,i)=>i===index?{...item,opens}:item))} maxLength={5}/></View>
          <View style={styles.grow}><SellerField label="Closes (HH:MM)" editable={!mutation.busy} value={row.closes} onChangeText={closes=>setHours(old=>old.map((item,i)=>i===index?{...item,closes}:item))} maxLength={5}/></View>
        </View>
        {hours.length === 1 && validTime(row.opens) && validTime(row.closes) && row.opens !== row.closes &&
          <SellerButton label="Use these hours every day" soft disabled={mutation.busy} onPress={() => {
            setHours([1,2,3,4,5,6,0].map(day => ({day,opens:row.opens,closes:row.closes})));
            setNotice("");
          }} />}
      </View>)}
      <SellerButton label="Add opening interval" soft disabled={mutation.busy || hours.length>=28} onPress={()=>setHours(old=>{
        const nextDay = [1,2,3,4,5,6,0].find(day=>!old.some(row=>row.day===day));
        return [...old,{day:nextDay ?? 1,opens:"09:00",closes:"18:00"}];
      })}/>
    </SellerCard>
    <SellerCard>
      <Text accessibilityRole="header" style={styles.section}>Fulfilment</Text>
      {(Object.keys(fulfilmentNames) as Fulfilment[]).map(key=>{
        const checked = methods.includes(key);
        return <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{checked}} disabled={mutation.busy}
          onPress={()=>setMethods(old=>old.includes(key)?old.filter(item=>item!==key):[...old,key])} style={styles.shopMethod}>
          <Text style={[styles.label,styles.grow]}>{fulfilmentNames[key]}</Text><View style={[styles.shopCheck,checked && styles.shopChecked]}>{checked && <Text style={styles.shopCheckText}>✓</Text>}</View>
        </Pressable>;
      })}
      {methods.includes("pickup") && <SellerField label="Pickup instructions" editable={!mutation.busy} value={pickupNote} onChangeText={setPickupNote} maxLength={400} multiline />}
    </SellerCard>
    </>}
    {section === "Account" && <>
      <AndroidPushSettings token={token} />
      <SellerAccountCard name={accountName} signOut={signOut} />
    </>}
    </SellerScroll>
    {section === "Availability" && <View style={styles.orderDock}>
      <MutationFeedback error={mutation.error} onReload={reload} />
      {(availabilityChanged || !!notice) && <Text accessibilityLiveRegion="polite" style={styles.shopSaved}>
        {pauseChanged ? `Save to ${closed ? "pause" : "resume"} your shop.` : availabilityChanged ? "Unsaved availability changes." : notice}
      </Text>}
      <View style={styles.shopTimes}>
        {availabilityChanged && <View style={styles.grow}><SellerButton label="Discard changes" soft disabled={mutation.busy} onPress={() => {
          setClosed(!!shop.temporarilyClosed);
          setHours(shop.openingHours ?? []);
          setMethods(savedMethods);
          setPickupNote(shop.pickupNote ?? "");
          setNotice("");
          mutation.clear();
        }} /></View>}
        <View style={styles.grow}><SellerButton label="Save availability" disabled={mutation.busy || !availabilityChanged} onPress={() => void mutation.run(async () => {
        setNotice("");
        if (!methods.length) throw new Error("Choose at least one fulfilment method.");
        if (hours.some(row=>!validTime(row.opens)||!validTime(row.closes)||row.opens===row.closes)) throw new Error("Enter different opening and closing times in HH:MM format.");
        const updated = await sellerApi.saveAvailability(token,shop,{temporarilyClosed:closed,openingHours:hours,fulfilment:methods,pickupNote:pickupNote.trim()});
        onSaved(updated);
        setClosed(!!updated.temporarilyClosed); setHours(updated.openingHours ?? []); setMethods(updated.fulfilment ?? []); setPickupNote(updated.pickupNote ?? "");
        setNotice("Availability saved.");
        })} /></View>
      </View>
    </View>}
  </>;
}

export function SellerAccountCard({name,signOut,onCancel}:{name:string;signOut:()=>Promise<void>;onCancel?:()=>void}) {
  const [confirm,setConfirm] = useState(!!onCancel);
  const mutation = useSellerMutation();
  const cancel = () => { setConfirm(false); mutation.clear(); onCancel?.(); };
  useAndroidBack(() => {
    if (!confirm) return false;
    if (!mutation.busy) cancel();
    return true;
  }, 25);
  return <SellerCard>
    <Text style={styles.title}>{name}</Text>
    {confirm ? <>
      <Text accessibilityRole="header" style={styles.section}>Sign out of Seller?</Text>
      <Text style={styles.copy}>You’ll need to sign in again to manage your shop and orders.</Text>
      <MutationFeedback error={mutation.error} />
      <SellerButton label="Keep working" soft disabled={mutation.busy} onPress={cancel} />
      <SellerButton label={mutation.busy ? "Signing out…" : "Confirm sign out"} disabled={mutation.busy} onPress={() => void mutation.run(signOut)} />
    </> : <SellerButton label="Sign out of seller account" soft onPress={() => setConfirm(true)} />}
  </SellerCard>;
}
const validMoney = (value:string) => /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value)>0 && Number.isFinite(Number(value));
const validStock = (value:string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
