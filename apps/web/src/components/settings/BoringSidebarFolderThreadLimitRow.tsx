import { BoringSidebarFolderThreadLimit } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useGT } from "gt-react";

import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

const isFolderThreadLimit = Schema.is(BoringSidebarFolderThreadLimit);

export function BoringSidebarFolderThreadLimitRow() {
  const searchableSetting = useSearchableSetting();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  const setting = searchableSetting("boring-sidebar-folder-thread-limit");
  return (
    <SettingsRow
      {...setting}
      className="px-0 py-2 sm:px-0"
      description={gt(
        "Show this many threads in each open folder, and this many more with each Show more.",
      )}
      control={
        <Select
          value={String(settings.boringSidebarFolderThreadLimit)}
          onValueChange={(next) => {
            const limit = Number(next);
            if (isFolderThreadLimit(limit))
              updateSettings({ boringSidebarFolderThreadLimit: limit });
          }}
        >
          <SelectTrigger size="sm" className="w-20 shrink-0" aria-label={setting.title}>
            <SelectValue>{settings.boringSidebarFolderThreadLimit}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {BoringSidebarFolderThreadLimit.literals.map((limit) => (
              <SelectItem hideIndicator key={limit} value={String(limit)}>
                {limit}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}
