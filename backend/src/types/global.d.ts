/**
 * Global type augmentations for Express
 */

import {
    IApiError,
    IApiMetadata,
    IPaginationInfo
} from './api';

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        interface Response {
            apiError: (error: IApiError | string, status?: number, details?: any) => Response;
            apiPaginated: <T>(data: T[], pagination: IPaginationInfo, metadata?: Partial<IApiMetadata>) => Response;
            apiSuccess: <T>(data: T, metadata?: Partial<IApiMetadata>, status?: number) => Response;
        }
        // eslint-disable-next-line @typescript-eslint/naming-convention
        interface Request {
            requestId: string;
            startTime: number;
        }
    }
}

export {};
