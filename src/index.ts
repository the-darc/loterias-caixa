export type {
  AllLatestDrawsResult,
  Draw,
  Lottery,
  LotteryCode,
  LotteryFailure,
  Weekday,
} from './types/public.ts';
export type { FetchLike, RequestOptions } from './client.ts';
export { getAllLatestDraws, getDraw, getLatestDraw } from './draws.ts';
export { getLotteryName, getSupportedLotteries, isSupportedLottery } from './lotteries.ts';
export {
  DrawNotFoundError,
  HttpError,
  InvalidResponseError,
  LotteryError,
  NetworkError,
  TimeoutError,
  UnsupportedLotteryError,
} from './errors.ts';
