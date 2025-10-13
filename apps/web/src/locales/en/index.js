import "dayjs/locale/en";
import dayjs from "dayjs";
import { enUS } from "date-fns/locale/en-US";
import { setCalendarLocale } from "@raypx/ui/lib/calendar-locale";

dayjs.locale("en");
setCalendarLocale(enUS);
