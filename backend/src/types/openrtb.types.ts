/**
 * OpenRTB 2.6 Type Definitions
 * 
 * Implements IAB OpenRTB 2.6 specification for real-time bidding
 * Reference: https://github.com/InteractiveAdvertisingBureau/openrtb
 */

// ========================================
// Core Request Objects
// ========================================

export interface OpenRTBBidRequest {
  /** Unique ID of the bid request */
  id: string;

  /** Array of Imp objects representing impressions offered */
  imp: Imp[];

  /** Details about the user's device */
  device?: Device;

  /** Details about the application */
  app?: App;

  /** Details about the website (for non-app traffic) */
  site?: Site;

  /** Details about the human user of the device */
  user?: User;

  /** Indicator of test mode */
  test?: number; // 0 = live mode, 1 = test mode

  /** Auction type: 1 = first price, 2 = second price */
  at?: number;

  /** Maximum time in milliseconds to submit a bid */
  tmax?: number;

  /** Allowlist of buyer seats that can bid */
  wseat?: string[];

  /** Block list of advertiser domains */
  badvAdvertisers?: string[];

  /** Block list of app bundle or package names */
  bapp?: string[];

  /** Regulatory object for legal and privacy requirements */
  regs?: Regs;

  /** Extension placeholder for exchange-specific fields */
  ext?: Record<string, unknown>;
}

export interface Imp {
  /** Unique ID of the impression within the bid request */
  id: string;

  /** Banner object for banner impressions */
  banner?: Banner;

  /** Video object for video impressions */
  video?: Video;

  /** Native object for native ad impressions */
  native?: Native;

  /** Name of ad mediation partner, SDK technology, or player responsible */
  tagid?: string;

  /** Minimum bid floor for this impression in CPM */
  bidfloor?: number;

  /** Currency specified using ISO-4217 alpha codes */
  bidfloorcur?: string;

  /** Indicator of secure (HTTPS) creative markup */
  secure?: number; // 0 = non-secure, 1 = secure required

  /** Array of exchange-specific names of supported iframe busters */
  iframebuster?: string[];

  /** Extension placeholder */
  ext?: ImpExt;
}

export interface ImpExt {
  /** Adapter-specific requirements */
  adapter?: {
    /** Required adapter IDs */
    required?: string[];
    /** Optional adapter IDs */
    optional?: string[];
  };
  /** SKAdNetwork info for iOS */
  skadn?: SKAdNetwork;
}

export interface SKAdNetwork {
  version: string;
  sourceapp: string;
  skadnetids: string[];
  productpage?: number;
}

export interface Banner {
  /** Width in device independent pixels */
  w?: number;

  /** Height in device independent pixels */
  h?: number;

  /** Array of format objects representing the banner sizes permitted */
  format?: Format[];

  /** Blocked creative types */
  btype?: number[];

  /** Blocked creative attributes */
  battr?: number[];

  /** Ad position */
  pos?: number;

  /** Relevant only for Banner objects used with Video */
  mimes?: string[];

  /** Topmost frame as measured in pixels */
  topframe?: number;

  /** Expandable direction */
  expdir?: number[];

  /** API frameworks supported */
  api?: number[];

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export interface Format {
  /** Width in device independent pixels */
  w: number;

  /** Height in device independent pixels */
  h: number;

  /** Relative width when expressing size as a ratio */
  wratio?: number;

  /** Relative height when expressing size as a ratio */
  hratio?: number;

  /** Minimum width in device independent pixels */
  wmin?: number;
}

export interface Video {
  /** Content MIME types supported */
  mimes: string[];

  /** Minimum video ad duration in seconds */
  minduration?: number;

  /** Maximum video ad duration in seconds */
  maxduration?: number;

  /** Array of supported video protocols */
  protocols?: number[];

  /** Width of the video player in device independent pixels */
  w?: number;

  /** Height of the video player in device independent pixels */
  h?: number;

  /** Video start delay in seconds for pre-roll, mid-roll, or post-roll ad placements */
  startdelay?: number;

  /** Video linearity */
  linearity?: number;

  /** Indicates if the player will allow the video to be skipped */
  skip?: number;

  /** Skip button offset in seconds */
  skipmin?: number;

  /** Skip after minimum seconds */
  skipafter?: number;

  /** Ad position */
  pos?: number;

  /** Blocked creative attributes */
  battr?: number[];

  /** Maximum extended ad duration if extension is allowed */
  maxextended?: number;

  /** Minimum bit rate in Kbps */
  minbitrate?: number;

  /** Maximum bit rate in Kbps */
  maxbitrate?: number;

  /** Delivery methods supported */
  delivery?: number[];

  /** Companion ads available */
  companionad?: Banner[];

  /** List of supported API frameworks */
  api?: number[];

  /** Supported companion ad types */
  companiontype?: number[];

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export interface Native {
  /** Request payload complying with Native Ad Specification */
  request: string;

  /** Version of the Native Ad Specification */
  ver?: string;

  /** List of supported API frameworks */
  api?: number[];

  /** Blocked creative attributes */
  battr?: number[];

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export interface Device {
  /** User agent string */
  ua?: string;

  /** Location of the device (lat/lon) */
  geo?: Geo;

  /** IP address of the device (IPv4) */
  ip?: string;

  /** IP address of the device (IPv6) */
  ipv6?: string;

  /** Device type */
  devicetype?: DeviceType;

  /** Device make */
  make?: string;

  /** Device model */
  model?: string;

  /** Device operating system */
  os?: string;

  /** Device operating system version */
  osv?: string;

  /** Hardware version of the device */
  hwv?: string;

  /** Physical width of the screen in pixels */
  w?: number;

  /** Physical height of the screen in pixels */
  h?: number;

  /** Screen size as pixels per linear inch */
  ppi?: number;

  /** Pixel ratio of the device */
  pxratio?: number;

  /** Support for JavaScript */
  js?: number;

  /** Indicates if the device has a camera */
  geofetch?: number;

  /** Flash version */
  flashver?: string;

  /** Browser language */
  language?: string;

  /** Carrier or ISP */
  carrier?: string;

  /** Mobile carrier using MCC-MNC code */
  mccmnc?: string;

  /** Network connection type */
  connectiontype?: ConnectionType;

  /** ID sanctioned for advertiser use */
  ifa?: string;

  /** Hardware device ID (IMEI) */
  didsha1?: string;

  /** Platform device ID (Android ID) hashed via SHA1 */
  dpidsha1?: string;

  /** MAC address of the device hashed via SHA1 */
  macsha1?: string;

  /** Limit ad tracking signal */
  lmt?: number;

  /** Extension placeholder */
  ext?: DeviceExt;
}

export interface DeviceExt {
  /** iOS Identifier for Advertising */
  idfa?: string;
  /** Android Advertising ID */
  gaid?: string;
  /** App Tracking Transparency status (iOS 14+) */
  atts?: number; // 0=Not determined, 1=Restricted, 2=Denied, 3=Authorized
  /** SKAdNetwork info */
  skadn?: SKAdNetwork;
}

export enum DeviceType {
  Mobile = 1,
  PersonalComputer = 2,
  ConnectedTV = 3,
  Phone = 4,
  Tablet = 5,
  ConnectedDevice = 6,
  SetTopBox = 7,
}

export enum ConnectionType {
  Unknown = 0,
  Ethernet = 1,
  WiFi = 2,
  CellularNetworkUnknown = 3,
  Cellular2G = 4,
  Cellular3G = 5,
  Cellular4G = 6,
  Cellular5G = 7,
}

export interface Geo {
  /** Latitude from -90.0 to +90.0, negative is south */
  lat?: number;

  /** Longitude from -180.0 to +180.0, negative is west */
  lon?: number;

  /** Country code using ISO-3166-1 Alpha-2 */
  country?: string;

  /** Region code using ISO-3166-2 */
  region?: string;

  /** Region of a country using FIPS 10-4 */
  regionfips104?: string;

  /** Google metro code */
  metro?: string;

  /** City using United Nations Code for Trade & Transport Locations */
  city?: string;

  /** Zip or postal code */
  zip?: string;

  /** Source of location data */
  type?: GeoType;

  /** Estimated location accuracy in meters */
  accuracy?: number;

  /** Number of seconds since this geolocation fix was established */
  lastfix?: number;

  /** IP routing type */
  ipservice?: number;

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export enum GeoType {
  GPS = 1,
  IP = 2,
  UserProvided = 3,
}

export interface App {
  /** Application ID on the exchange */
  id?: string;

  /** Application name */
  name?: string;

  /** Bundle or package name */
  bundle?: string;

  /** Domain of the application */
  domain?: string;

  /** App store URL */
  storeurl?: string;

  /** Array of IAB content categories */
  cat?: string[];

  /** Array of IAB content categories for section */
  sectioncat?: string[];

  /** Array of IAB content categories for page */
  pagecat?: string[];

  /** Application version */
  ver?: string;

  /** Indicates if the app has a privacy policy */
  privacypolicy?: number;

  /** Paid  = 0, or free = 1 */
  paid?: number;

  /** Details about the publisher */
  publisher?: Publisher;

  /** Details about the content */
  content?: Content;

  /** Keywords about the app */
  keywords?: string;

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export interface Site {
  /** Site ID on the exchange */
  id?: string;

  /** Site name */
  name?: string;

  /** Domain of the site */
  domain?: string;

  /** Array of IAB content categories */
  cat?: string[];

  /** Array of IAB content categories for section */
  sectioncat?: string[];

  /** Array of IAB content categories for page */
  pagecat?: string[];

  /** URL of the page */
  page?: string;

  /** Referrer URL */
  ref?: string;

  /** Search string that caused navigation */
  search?: string;

  /** Mobile-optimized signal */
  mobile?: number;

  /** Indicates if the site has a privacy policy */
  privacypolicy?: number;

  /** Details about the publisher */
  publisher?: Publisher;

  /** Details about the content */
  content?: Content;

  /** Keywords about the site */
  keywords?: string;

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export interface Publisher {
  /** Publisher ID */
  id?: string;

  /** Publisher name */
  name?: string;

  /** Array of IAB content categories */
  cat?: string[];

  /** Publisher domain */
  domain?: string;

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export interface Content {
  /** Content ID */
  id?: string;

  /** Content episode */
  episode?: number;

  /** Content title */
  title?: string;

  /** Content series */
  series?: string;

  /** Content season */
  season?: string;

  /** Artist credited with the content */
  artist?: string;

  /** Genre that best describes the content */
  genre?: string;

  /** Album to which the content belongs */
  album?: string;

  /** International Standard Recording Code */
  isrc?: string;

  /** Producer */
  producer?: Producer;

  /** URL of the content */
  url?: string;

  /** Array of IAB content categories */
  cat?: string[];

  /** Production quality */
  prodq?: number;

  /** Type of content */
  context?: number;

  /** Content rating */
  contentrating?: string;

  /** User rating of the content */
  userrating?: string;

  /** Media rating per QAG guidelines */
  qagmediarating?: number;

  /** Keywords about the content */
  keywords?: string;

  /** Live stream? */
  livestream?: number;

  /** Source relationship */
  sourcerelationship?: number;

  /** Length of content in seconds */
  len?: number;

  /** Content language using ISO-639-1 alpha-2 */
  language?: string;

  /** Embeddable? */
  embeddable?: number;

  /** Details about the content producer */
  data?: Data[];

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export interface Producer {
  /** Producer ID */
  id?: string;

  /** Producer name */
  name?: string;

  /** Array of IAB content categories */
  cat?: string[];

  /** Producer domain */
  domain?: string;

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export interface User {
  /** Buyer-specific ID for the user */
  id?: string;

  /** Buyer-specific ID mapped by exchange */
  buyeruid?: string;

  /** Year of birth as a 4-digit integer */
  yob?: number;

  /** Gender ("M" = male, "F" = female, "O" = known other) */
  gender?: string;

  /** Comma-separated list of keywords */
  keywords?: string;

  /** Custom data */
  customdata?: string;

  /** Location of the user's home base */
  geo?: Geo;

  /** Additional user data */
  data?: Data[];

  /** Consent string as defined by IAB TCF v2 */
  consent?: string;

  /** Extension placeholder */
  ext?: UserExt;
}

export interface UserExt {
  /** GPP consent string */
  gpp?: string;
  /** GPP section IDs */
  gpp_sid?: number[];
  /** TCF consent string */
  tcfv2?: string;
}

export interface Data {
  /** Data provider ID */
  id?: string;

  /** Data provider name */
  name?: string;

  /** Array of Segment objects */
  segment?: Segment[];

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export interface Segment {
  /** Segment ID */
  id?: string;

  /** Segment name */
  name?: string;

  /** Segment value */
  value?: string;

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export interface Regs {
  /** Flag indicating if COPPA regulations apply */
  coppa?: number;

  /** Extension placeholder for GDPR and other regulations */
  ext?: RegsExt;
}

export interface RegsExt {
  /** GDPR applies: 0 = no, 1 = yes */
  gdpr?: number;
  /** US Privacy string (CCPA) */
  us_privacy?: string;
  /** GPP string */
  gpp?: string;
  /** GPP section IDs */
  gpp_sid?: number[];
}

// ========================================
// Response Objects
// ========================================

export interface OpenRTBBidResponse {
  /** ID of the bid request to which this is a response */
  id: string;

  /** Array of Seatbid objects */
  seatbid?: Seatbid[];

  /** Bid response ID to assist with logging/tracking */
  bidid?: string;

  /** Bid currency using ISO-4217 alpha codes */
  cur?: string;

  /** Custom data */
  customdata?: string;

  /** Reason for not bidding */
  nbr?: NoBidReason;

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export interface Seatbid {
  /** Array of Bid objects */
  bid: Bid[];

  /** ID of the buyer seat on whose behalf this bid is made */
  seat?: string;

  /** If multiple impressions are in request, 0 = impressions may be won individually, 1 = must win all or none */
  group?: number;

  /** Extension placeholder */
  ext?: Record<string, unknown>;
}

export interface Bid {
  /** Bidder generated bid ID */
  id: string;

  /** ID of the Imp object in the related bid request */
  impid: string;

  /** Bid price expressed as CPM */
  price: number;

  /** Win notice URL */
  nurl?: string;

  /** Billing notice URL */
  burl?: string;

  /** Loss notice URL */
  lurl?: string;

  /** Advertiser domain for block list checking */
  adomain?: string[];

  /** Bundle or package name of the app being advertised */
  bundle?: string;

  /** Campaign ID */
  cid?: string;

  /** Creative ID */
  crid?: string;

  /** IAB content categories of the creative */
  cat?: string[];

  /** Set of attributes describing the creative */
  attr?: number[];

  /** API required by the markup */
  api?: number;

  /** Video response protocol of the markup */
  protocol?: number;

  /** Creative markup */
  adm?: string;

  /** Width of the creative in device independent pixels */
  w?: number;

  /** Height of the creative in device independent pixels */
  h?: number;

  /** Advisory as to the number of seconds the bidder is willing to wait for the creative to be displayed */
  exp?: number;

  /** Extension placeholder */
  ext?: BidExt;
}

export interface BidExt {
  /** SKAdNetwork info for iOS attribution */
  skadn?: SKAdNetworkResponse;
  /** Additional tracking URLs */
  tracking?: {
    impression?: string[];
    click?: string[];
    error?: string[];
  };
}

export interface SKAdNetworkResponse {
  version: string;
  network: string;
  campaign: string;
  itunesitem: string;
  nonce: string;
  sourceapp: string;
  timestamp: string;
  signature: string;
}

export enum NoBidReason {
  Unknown = 0,
  TechnicalError = 1,
  InvalidRequest = 2,
  KnownWebSpider = 3,
  SuspectedNonHumanTraffic = 4,
  CloudDataCenterProxy = 5,
  UnsupportedDevice = 6,
  BlockedPublisher = 7,
  UnmatchedUser = 8,
  DailyReaderCapMet = 9,
  DailyDomainCapMet = 10,
}
