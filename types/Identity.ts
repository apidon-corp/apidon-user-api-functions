export type UserIdentityDoc = {
  id: string;
  created: number;
  status: "canceled" | "processing" | "requires_input" | "verified";
  livemode: boolean;
};
