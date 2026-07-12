import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../../messages/ko.json";

function IntlTestProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="ko"
      messages={ko as never}
      timeZone="Asia/Seoul"
    >
      {children}
    </NextIntlClientProvider>
  );
}

export function renderWithIntl(ui: ReactElement) {
  return render(ui, { wrapper: IntlTestProvider });
}
