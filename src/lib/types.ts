export type CategoryDoc = {
  id: string;
  name: string;
  title: string;
  nameEn: string;
  slug: string;
  imageUrl: string;
  imagePublicId?: string;
  order?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type DesignDoc = {
  id: string;
  name: string;
  category: string;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
  imageUrl: string;
  imagePublicId?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type SubcategoryDoc = {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  order?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AppSettings = {
  phoneNumber: string;
  phoneDisplay: string;
  whatsappNumber: string;
  heroTitle: string;
  heroSubtitle: string;
  heroDescription: string;
  heroImageUrl: string;
  heroImagePublicId?: string;
  appTitle: string;
  appSubtitle: string;
  logoImageUrl: string;
  logoImagePublicId?: string;
  updatedAt?: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  phoneNumber: "+8801976600300",
  phoneDisplay: "০১৯৭৬-৬০০৩০০",
  whatsappNumber: "8801976600300",
  heroTitle: "আর এস ৩ডি ওয়ালপেপার অ্যান্ড ফ্লোর",
  heroSubtitle: "৩ডি ওয়ালপেপার • ৩ডি সিলিং পেপার • ৩ডি ইপক্সি ফ্লোর",
  heroDescription: "সারা বাংলাদেশে হোম ডেলিভারি ও প্রফেশনাল ফিটিং সার্ভিস",
  heroImageUrl: "",
  appTitle: "আর এস ৩ডি ডেকর",
  appSubtitle: "প্রিমিয়াম ডিজাইন শোকেস",
  logoImageUrl: ""
};
