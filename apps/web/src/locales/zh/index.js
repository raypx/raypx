import "dayjs/locale/zh-cn";
import dayjs from "dayjs";
import { zhCN } from "date-fns/locale/zh-CN";
import { setCalendarLocale } from "@raypx/ui/lib/calendar-locale";

dayjs.locale("zh-cn");
setCalendarLocale(zhCN);
