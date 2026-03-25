import type { GeoLocation } from "@/types";

interface NominatimResult {
  display_name: string;
  address: {
    cemetery?: string;
    leisure?: string;
    amenity?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeoLocation> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=17`;

  const res = await fetch(url, {
    headers: { "User-Agent": "GraveLens/1.0 (cemetery history app)" },
  });

  if (!res.ok) {
    return { lat, lng };
  }

  const data: NominatimResult = await res.json();
  const addr = data.address;

  const cemetery =
    addr.cemetery || addr.leisure || addr.amenity || undefined;
  const city = addr.city || addr.town || addr.village || undefined;

  return {
    lat,
    lng,
    cemetery,
    address: data.display_name,
    city,
    state: addr.state,
    country: addr.country,
  };
}
