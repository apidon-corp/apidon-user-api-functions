export type UserIdentityDoc =
  | {
      id: string;
      created: number;
      status: "canceled" | "processing" | "requires_input" | "verified";
      livemode: boolean;
    }
  | {
      id: string;
      created: number;
      status: "verified";
      livemode: boolean;
      firstName: string;
      lastName: string;
      dateOfBirth: number;
      idNumber: string;
    };
