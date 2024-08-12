export type UserIdentityDoc =
  | {
      id: string;
      created: number;
      status: "canceled" | "processing" | "requires_input";
      livemode: boolean;
    }
  | {
      id: string;
      created: number;
      status: "verified";
      livemode: boolean;
      verificationReportId: string;
      firstName: string;
      lastName: string;
      idNumber: string;
      type: string;
      issuingCountry: string;
      dateOfBirth: string;
    };
