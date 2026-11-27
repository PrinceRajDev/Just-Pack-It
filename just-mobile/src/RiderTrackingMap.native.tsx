import Constants from "expo-constants";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { RiderTrackingMapProps } from "./RiderTrackingMap";
import { theme } from "./theme";

export function RiderTrackingMap({destination,rider}: RiderTrackingMapProps) {
  if (Platform.OS === "android" && Constants.executionEnvironment !== "storeClient" && !Constants.expoConfig?.extra?.androidMapsEnabled) return null;
  const [longitude,latitude] = destination;
  const dropoff = {latitude,longitude};
  const latitudeSpan = rider ? rider.latitude-latitude : 0;
  const longitudeSpan = rider ? ((rider.longitude-longitude+540)%360)-180 : 0;
  const centerLongitude = ((longitude+longitudeSpan/2+540)%360)-180;

  return <View style={styles.frame}>
    <MapView
      accessibilityLabel={rider ? "Map showing rider and delivery address" : "Map showing your delivery address"}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      style={styles.map}
      region={{
        latitude:latitude+latitudeSpan/2,
        longitude:centerLongitude,
        latitudeDelta:Math.max(0.012,Math.abs(latitudeSpan)*1.75),
        longitudeDelta:Math.max(0.012,Math.abs(longitudeSpan)*1.75),
      }}
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
    >
      <Marker identifier="dropoff" coordinate={dropoff} title="Delivery address" pinColor="#C94B24" />
      {rider && <Marker identifier="rider" coordinate={rider} title="Rider" pinColor="#256B40" />}
    </MapView>
    <Text style={styles.legend}>{rider ? "Green · Rider     Orange · Delivery address" : "Orange · Delivery address"}</Text>
  </View>;
}

const styles=StyleSheet.create({
  frame:{borderRadius:14,overflow:"hidden",borderWidth:1,borderColor:theme.border},
  map:{width:"100%",height:220},
  legend:{padding:8,color:theme.ink,fontSize:12},
});
