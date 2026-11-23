import { useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { marketApi } from "./api";
import { BuyerStateCard } from "./BuyerStateCard";
import { resolveImage } from "./images";
import { fulfilmentNames, sellerApi, type Fulfilment, type SellerProduct, type SellerShop } from "./sellerApi";
import { rupees, styles, LoadState, MutationFeedback, Row, SellerButton, SellerCard, SellerField, SellerScroll, useSellerData, useSellerMutation, useSellerPages } from "./SellerWorkspaceUI";
import { useAndroidBack } from "./useAndroidBack";

const filters = ["All","Active","Inactive","Low stock","Out of stock"] as const;
const shelfPhoto = require("../assets/browse-categories/grocery.webp");
const productIcon = require("../assets/nav-icons/bag.png");

function stockLevels(item: SellerProduct) {
  return item.variants?.length ? item.variants.map(option => option.stock) : [item.stock];
}

export function SellerCatalogue({token,lowStock}:{token:string;lowStock:boolean}) {
  const listing = useSellerPages(sellerApi.products,token);
  const [query,setQuery] = useState("");
  const [filter,setFilter] = useState<typeof filters[number]>(lowStock ? "Low stock" : "All");
  const [edit,setEdit] = useState<SellerProduct | "new">();
  const [stockProduct,setStockProduct] = useState<SellerProduct>();
  const [notice,setNotice] = useState("");
  const open = useSellerMutation();
  const leaveEditor = () => setEdit(undefined);
  if (edit) return <ProductEditor token={token} product={edit==="new" ? undefined : edit} close={leaveEditor} saved={listing.reload} />;
  if (stockProduct) return <QuickStock token={token} product={stockProduct} close={() => setStockProduct(undefined)}
    reload={() => sellerApi.product(token,stockProduct.id)} saved={updated => {
      listing.setData(previous => previous && {...previous,items:previous.items.map(item => item.id === updated.id ? updated : item)});
      setNotice(`Stock updated for ${updated.name}.`);
      setStockProduct(undefined);
      listing.reload();
    }} />;
  const rows = listing.data?.items.filter(item => {
    const stocks = stockLevels(item);
    return item.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (filter === "All" || (filter==="Active" && item.active) || (filter==="Inactive" && !item.active) ||
        (filter==="Low stock" && item.active && stocks.some(value => value > 0 && value <= 5)) ||
        (filter==="Out of stock" && item.active && stocks.some(value => value === 0)));
  });
  return <SellerScroll refreshing={listing.loading} onRefresh={listing.reload}>
    <View style={styles.catalogueHero}>
      <View style={styles.catalogueHeroCopy}>
        <Text accessibilityRole="header" style={styles.heroTitle}>Shop shelves</Text>
        {listing.data && <Text style={styles.heroKicker}>{listing.data.items.length}{listing.data.next ? "+" : ""} {listing.data.items.length === 1 && !listing.data.next ? "product" : "products"}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="Add product" onPress={() => setEdit("new")} style={({pressed}) => [styles.catalogueAdd,pressed && styles.pressed]}>
          <Text style={styles.label}>＋ Add product</Text>
        </Pressable>
      </View>
      <Image source={shelfPhoto} resizeMode="cover" style={styles.catalogueHeroPhoto} accessible={false} />
    </View>
    <View style={styles.catalogueFilters}>
      <View style={styles.catalogueSearch}>
        <TextInput accessibilityLabel="Search products" placeholder="Search products" placeholderTextColor="#57665E" value={query} onChangeText={setQuery} returnKeyType="search" style={styles.catalogueSearchInput} />
        {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear product search" onPress={() => setQuery("")} style={styles.catalogueAction}><Text style={styles.link}>Clear</Text></Pressable>}
      </View>
      <View style={styles.chips}>{filters.map(value => {
        const selected = value === filter;
        return <Pressable key={value} accessibilityRole="tab" accessibilityState={{selected}} style={[styles.chip,styles.catalogueChip,selected && styles.dispatchModeActive]} onPress={() => setFilter(value)}><Text style={selected ? styles.dispatchModeTextActive : styles.link}>{value}</Text></Pressable>;
      })}</View>
    </View>
    <View style={styles.orderTop}>
      <Text accessibilityRole="header" style={[styles.section,styles.grow]}>{filter === "All" ? "Products" : filter}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh catalogue" disabled={listing.loading} onPress={listing.reload} style={styles.dispatchRefresh}><Text style={styles.link}>{listing.loading ? "Refreshing…" : "Refresh"}</Text></Pressable>
    </View>
    <LoadState error={listing.error} loading={listing.loading&&!listing.data} retry={listing.reload} />
    <MutationFeedback error={open.error} />
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.catalogueNotice}>{notice}</Text>}
    {!listing.loading && !listing.error && !rows?.length && <BuyerStateCard title="No products in this view" copy="Add a product or try a different search or filter." icon="bag" />}
    {rows?.map(item => <CatalogueProduct key={item.id} item={item} disabled={open.busy}
      onPress={() => void open.run(async () => { setNotice(""); setEdit(await sellerApi.product(token,item.id)); })}
      onStock={() => void open.run(async () => {
        setNotice("");
        const current = await sellerApi.product(token,item.id);
        if (current.variants?.length) setEdit(current);
        else setStockProduct(current);
      })} />)}
    {listing.data?.next && <SellerButton label={listing.moreBusy?"Loading…":"Load more products"} soft disabled={listing.moreBusy} onPress={listing.more} />}
  </SellerScroll>;
}

function CatalogueProduct({item,disabled,onPress,onStock}:{item:SellerProduct;disabled:boolean;onPress:()=>void;onStock:()=>void}) {
  const [failedImage,setFailedImage] = useState("");
  const image = resolveImage(item.image);
  const stocks = stockLevels(item);
  const empty = stocks.filter(stock => stock === 0).length;
  const low = stocks.some(stock => stock > 0 && stock <= 5);
  const status = !item.active ? "Inactive" : empty === stocks.length ? "Out of stock" : empty > 0 ? "Some packs sold out" : low ? "Low stock" : "In stock";
  const stockLabel = item.variants?.length ? `${item.variants.length} ${item.variants.length === 1 ? "pack" : "packs"}` : `${item.stock} available`;
  return <View style={styles.dispatchTicket}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} accessibilityHint={`${stockLabel}, ${status}`} disabled={disabled} onPress={onPress}
      style={({pressed})=>[styles.catalogueProductBody,pressed && styles.pressed]}>
      <View style={styles.catalogueThumb}>
        {image && image !== failedImage
          ? <Image source={{uri:image}} style={styles.catalogueThumbPhoto} resizeMode="cover" accessible={false} onError={() => setFailedImage(image)} />
          : <Image source={productIcon} resizeMode="contain" style={[styles.sellerIcon,styles.cataloguePlaceholder]} accessible={false} />}
      </View>
      <View style={styles.grow}>
        <Text style={styles.title}>{item.name}</Text>
        <Text style={styles.copy}>{[item.unit,stockLabel].filter(Boolean).join(" · ")}</Text>
        <Text style={styles.orderAmount}>{rupees(item.price)}</Text>
      </View>
      <Text style={styles.link}>›</Text>
    </Pressable>
    <View style={styles.catalogueProductFooter}>
      <Text style={[styles.orderStatus,!item.active && styles.catalogueInactive,(empty > 0 || low) && item.active && styles.workCountActive]}>{status}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Manage stock for ${item.name}`} disabled={disabled} onPress={onStock} style={styles.catalogueAction}>
        <Text style={styles.link}>{item.variants?.length ? "Manage packs" : "Update stock"}</Text>
      </Pressable>
    </View>
  </View>;
}

function QuickStock({token,product,close,saved,reload}:{token:string;product:SellerProduct;close:()=>void;saved:(product:SellerProduct)=>void;reload:()=>Promise<SellerProduct>}) {
  const [current,setCurrent] = useState(product);
  const [stock,setStock] = useState(String(product.stock));
  const mutation = useSellerMutation();
  useAndroidBack(() => { if (!mutation.busy) close(); return true; }, 25);
  return <SellerScroll>
    <Pressable accessibilityRole="button" disabled={mutation.busy} onPress={close} style={styles.orderBack}><Text style={styles.link}>‹  Back to catalogue</Text></Pressable>
    <View style={styles.orderHero}>
      <Text style={styles.heroKicker}>Update stock</Text>
      <Text accessibilityRole="header" style={styles.heroTitle}>{current.name}</Text>
      <Text style={styles.heroKicker}>{current.stock} currently available</Text>
    </View>
    <SellerCard>
      <SellerField label="Available units" value={stock} onChangeText={setStock} keyboardType="number-pad" selectTextOnFocus editable={!mutation.busy} />
      <MutationFeedback error={mutation.error} onReload={() => void mutation.run(async () => {
        const fresh = await reload();
        setCurrent(fresh);
        setStock(String(fresh.stock));
      })} />
      {current.variants?.length ? <Text style={styles.copy}>This product now has packs. Go back and choose Manage packs.</Text>
        : <SellerButton label={mutation.busy ? "Saving…" : "Save stock"} disabled={mutation.busy || !validStock(stock) || Number(stock) === current.stock}
          onPress={() => void mutation.run(async () => saved(await sellerApi.inventory(token,current,Number(stock))))} />}
    </SellerCard>
  </SellerScroll>;
}

function ProductEditor({token,product,close,saved}:{token:string;product?:SellerProduct;close:()=>void;saved:()=>void}) {
  const [current,setCurrent] = useState(product);
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
  const categories = useSellerData(marketApi.categories,token);
  const mutation = useSellerMutation();
  const hasVariants = !!current?.variants?.length;
  useAndroidBack(() => { if (!mutation.busy) close(); return true; }, 25);
  const refresh = async () => {
    if (!current) return;
    const next = await sellerApi.product(token,current.id);
    setCurrent(next); setStock(String(next.stock));
  };
  const save = () => void mutation.run(async () => {
    if (!name.trim() || !unit.trim() || !categoryId || !validMoney(price) || (!hasVariants && !validStock(stock)) || (mrp && (!validMoney(mrp) || Number(mrp)<Number(price)))) throw new Error("Enter a name, unit, category, valid price and whole-number stock. MRP must be at least the selling price.");
    const result = await sellerApi.saveProduct(token,{
      name:name.trim(),unit:unit.trim(),description:description.trim(),categoryId,price:Number(price),
      mrp:mrp ? Number(mrp) : null,stock:hasVariants ? current!.stock : Number(stock),active:isActive,
      ...(current && current.categoryId!==categoryId ? {subcategoryId:null} : {}),
    },current);
    setCurrent(result); setStock(String(result.stock)); saved(); setNotice("Product saved.");
  });
  return <SellerScroll>
    <SellerButton label="Back to catalogue" soft disabled={mutation.busy} onPress={close} />
    <Text accessibilityRole="header" style={styles.section}>{current ? "Edit product" : "Add product"}</Text>
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.link}>{notice}</Text>}
    <MutationFeedback error={mutation.error} onReload={current ? ()=>void mutation.run(refresh) : undefined} />
    <SellerCard>
      <SellerField label="Product name" value={name} onChangeText={setName} maxLength={100} />
      <SellerField label="Unit or pack size" value={unit} onChangeText={setUnit} maxLength={100} />
      <SellerField label="Description" value={description} onChangeText={setDescription} maxLength={2000} multiline />
      <Text style={styles.label}>Category</Text>
      <LoadState error={categories.error} loading={categories.loading&&!categories.data} retry={categories.reload}/>
      <View style={styles.chips}>{categories.data?.map(item => <Pressable accessibilityRole="radio" accessibilityState={{checked:categoryId===item.id}} key={item.id} onPress={() => setCategory(item.id)} style={[styles.chip,categoryId===item.id && styles.sage]}><Text style={styles.link}>{item.name}</Text></Pressable>)}</View>
      <SellerField label="Price (₹)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      <SellerField label="MRP (₹), optional" value={mrp} onChangeText={setMrp} keyboardType="decimal-pad" />
      {!hasVariants && <SellerField label="Stock" value={stock} onChangeText={setStock} keyboardType="number-pad" />}
      <SellerButton label={isActive?"✓ Listing active":"Listing inactive"} soft onPress={() => setIsActive(value=>!value)} />
      <SellerButton label="Save product" disabled={mutation.busy} onPress={save} />
      {current && !hasVariants && <SellerButton label="Update stock only" soft disabled={mutation.busy} onPress={() => void mutation.run(async () => {
        if (!validStock(stock)) throw new Error("Enter a whole number of units.");
        setCurrent(await sellerApi.inventory(token,current,Number(stock))); saved(); setNotice("Stock updated.");
      })} />}
    </SellerCard>
    {current && <SellerCard>
      <Text style={styles.title}>Pack variants</Text>
      {current.variants?.map(item => <Row key={item.id} title={item.label} detail={`${rupees(item.price)} · ${item.stock}`} onPress={() => setVariant({id:item.id,label:item.label,price:String(item.price),stock:String(item.stock)})} />)}
      {!variant && <SellerButton label="Add variant" soft onPress={() => setVariant({label:"",price:"",stock:""})} />}
      {variant && <>
        <SellerField label="Pack label" value={variant.label} onChangeText={label=>setVariant({...variant,label})}/>
        <SellerField label="Variant price (₹)" value={variant.price} onChangeText={price=>setVariant({...variant,price})} keyboardType="decimal-pad"/>
        <SellerField label="Variant stock" value={variant.stock} onChangeText={stock=>setVariant({...variant,stock})} keyboardType="number-pad"/>
        <SellerButton label="Save variant" disabled={mutation.busy} onPress={() => void mutation.run(async () => {
          if (!variant.label.trim() || !validMoney(variant.price) || !validStock(variant.stock)) throw new Error("Enter a pack label, valid price and whole-number stock.");
          await sellerApi.variant(token,current,{label:variant.label.trim(),price:Number(variant.price),stock:Number(variant.stock)},variant.id);
          setVariant(undefined); saved(); await refresh(); setNotice("Variant saved.");
        })} />
        <SellerButton label="Close variant editor" soft disabled={mutation.busy} onPress={() => setVariant(undefined)} />
      </>}
    </SellerCard>}
  </SellerScroll>;
}

const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export function SellerShopSettings({token,name,signOut}:{token:string;name:string;signOut:()=>Promise<void>}) {
  const data = useSellerData(() => sellerApi.shop(token),token);
  const mutation = useSellerMutation();
  return <SellerScroll>
    <LoadState error={data.error} loading={data.loading&&!data.data} retry={data.reload}/>
    {data.data && <ShopEditor key={`${data.data.id}:${data.data.version}`} token={token} shop={data.data} onSaved={data.setData} reload={data.reload} />}
    <SellerCard><Text style={styles.title}>{name}</Text><MutationFeedback error={mutation.error} /><SellerButton label="Sign out of seller account" soft disabled={mutation.busy} onPress={()=>void mutation.run(signOut)} /></SellerCard>
  </SellerScroll>;
}

function ShopEditor({token,shop,onSaved,reload}:{token:string;shop:SellerShop;onSaved:(value:SellerShop)=>void;reload:()=>void}) {
  const [name,setName] = useState(shop.name);
  const [address,setAddress] = useState(shop.address ?? "");
  const [description,setDescription] = useState(shop.description ?? "");
  const [closed,setClosed] = useState(!!shop.temporarilyClosed);
  const [hours,setHours] = useState(shop.openingHours ?? []);
  const [methods,setMethods] = useState(shop.fulfilment ?? []);
  const [pickupNote,setPickupNote] = useState(shop.pickupNote ?? "");
  const mutation = useSellerMutation();
  return <>
    <MutationFeedback error={mutation.error} onReload={reload} />
    <SellerCard>
      <Text style={styles.eyebrow}>SHOP PROFILE</Text>
      <Text style={styles.copy}>Approval status · {shop.status}</Text>
      {shop.review?.reason && <Text style={styles.copy}>{shop.review.reason}</Text>}
      <SellerField label="Shop name" value={name} onChangeText={setName} maxLength={100} />
      <SellerField label="Street address" value={address} onChangeText={setAddress} maxLength={500} />
      <SellerField label="Shop description" value={description} onChangeText={setDescription} maxLength={1000} multiline />
      <SellerButton label="Save shop details" disabled={mutation.busy} onPress={() => void mutation.run(async () => {
        if (name.trim().length<2 || address.trim().length<2) throw new Error("Enter the shop name and street address.");
        onSaved(await sellerApi.saveProfile(token,shop,{name:name.trim(),address:address.trim(),description:description.trim()}));
      })} />
    </SellerCard>
    <SellerCard>
      <Text style={styles.title}>Opening hours</Text>
      <Text style={styles.copy}>{shop.timezone || "Asia/Kolkata"} · Use 24-hour time.</Text>
      <SellerButton label={closed ? "✓ Temporarily closed" : "Temporarily close shop"} soft onPress={()=>setClosed(value=>!value)} />
      {hours.map((row,index) => <View key={index} style={{gap:8}}>
        <Text style={styles.label}>{days[row.day]}</Text>
        <View style={styles.chips}>{days.map((day,dayIndex) => <Pressable key={day} style={[styles.chip,row.day===dayIndex&&styles.sage]} onPress={()=>setHours(old=>old.map((item,i)=>i===index?{...item,day:dayIndex}:item))}><Text style={styles.link}>{day.slice(0,3)}</Text></Pressable>)}</View>
        <SellerField label="Opens (HH:MM)" value={row.opens} onChangeText={opens=>setHours(old=>old.map((item,i)=>i===index?{...item,opens}:item))} maxLength={5}/>
        <SellerField label="Closes (HH:MM)" value={row.closes} onChangeText={closes=>setHours(old=>old.map((item,i)=>i===index?{...item,closes}:item))} maxLength={5}/>
        <SellerButton label="Remove interval" soft onPress={()=>setHours(old=>old.filter((_,i)=>i!==index))}/>
      </View>)}
      <SellerButton label="Add opening interval" soft disabled={hours.length>=28} onPress={()=>setHours(old=>[...old,{day:1,opens:"09:00",closes:"18:00"}])}/>
      <Text style={styles.title}>Fulfilment methods</Text>
      {(Object.keys(fulfilmentNames) as Fulfilment[]).map(key=><SellerButton key={key} label={(methods.includes(key)?"✓ ":"")+fulfilmentNames[key]} soft onPress={()=>setMethods(old=>old.includes(key)?old.filter(item=>item!==key):[...old,key])}/>)}
      {methods.includes("pickup") && <SellerField label="Pickup instructions" value={pickupNote} onChangeText={setPickupNote} maxLength={400} multiline />}
      <SellerButton label="Save availability" disabled={mutation.busy} onPress={() => void mutation.run(async () => {
        if (!methods.length) throw new Error("Choose at least one fulfilment method.");
        if (hours.some(row=>!validTime(row.opens)||!validTime(row.closes)||row.opens===row.closes)) throw new Error("Enter different opening and closing times in HH:MM format.");
        onSaved(await sellerApi.saveAvailability(token,shop,{temporarilyClosed:closed,openingHours:hours,fulfilment:methods,pickupNote:pickupNote.trim()}));
      })} />
    </SellerCard>
  </>;
}
const validMoney = (value:string) => /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value)>0 && Number.isFinite(Number(value));
const validStock = (value:string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
const validTime = (value:string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
