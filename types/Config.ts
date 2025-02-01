export type CollectibleConfigDocData = {
  stockLimit: number;
};

export type VersionConfigDocData = {
  latestVersion: string;
  availableVersions: string[];
};

export type AccessConfigDocData = {
  admin: boolean;
  user: boolean;
};

export type PasswordsDocData = {
  admin : string,
}
