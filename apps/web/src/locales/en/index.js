import "dayjs/locale/en";
import { setCalendarLocale } from "@raypx/ui/lib/calendar-locale";
import { enUS } from "date-fns/locale/en-US";
import dayjs from "dayjs";

dayjs.locale("en");
setCalendarLocale(enUS);
