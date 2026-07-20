import { useQuery } from '@tanstack/react-query';
import {
  incomeReportsService,
  IncomeReportParams,
  IncomeByPeriodParams,
  IncomeByClientParams,
  CollectionStatusData,
  IncomeByCategoryData,
  IncomeByServiceItemData,
  IncomeByPeriodData,
  IncomeByClientData,
} from '../services/incomeReportsService';

export const incomeReportsKeys = {
  all: ['income-reports'] as const,
  collectionStatus: (params: IncomeReportParams) =>
    [...incomeReportsKeys.all, 'collection-status', params] as const,
  byCategory: (params: IncomeReportParams) =>
    [...incomeReportsKeys.all, 'by-category', params] as const,
  byServiceItem: (params: IncomeReportParams) =>
    [...incomeReportsKeys.all, 'by-service-item', params] as const,
  byPeriod: (params: IncomeByPeriodParams) =>
    [...incomeReportsKeys.all, 'by-period', params] as const,
  byClient: (params: IncomeByClientParams) =>
    [...incomeReportsKeys.all, 'by-client', params] as const,
};

export const useCollectionStatus = (params: IncomeReportParams = {}) => {
  return useQuery<CollectionStatusData>({
    queryKey: incomeReportsKeys.collectionStatus(params),
    queryFn: () => incomeReportsService.getCollectionStatus(params),
    staleTime: 60 * 1000,
  });
};

export const useIncomeByCategory = (params: IncomeReportParams = {}) => {
  return useQuery<IncomeByCategoryData>({
    queryKey: incomeReportsKeys.byCategory(params),
    queryFn: () => incomeReportsService.getByCategory(params),
    staleTime: 60 * 1000,
  });
};

export const useIncomeByClient = (params: IncomeByClientParams = {}) => {
  return useQuery<IncomeByClientData>({
    queryKey: incomeReportsKeys.byClient(params),
    queryFn: () => incomeReportsService.getByClient(params),
    staleTime: 60 * 1000,
  });
};

export const useIncomeByPeriod = (params: IncomeByPeriodParams = {}) => {
  return useQuery<IncomeByPeriodData>({
    queryKey: incomeReportsKeys.byPeriod(params),
    queryFn: () => incomeReportsService.getByPeriod(params),
    staleTime: 60 * 1000,
  });
};

export const useIncomeByServiceItem = (params: IncomeReportParams = {}) => {
  return useQuery<IncomeByServiceItemData>({
    queryKey: incomeReportsKeys.byServiceItem(params),
    queryFn: () => incomeReportsService.getByServiceItem(params),
    staleTime: 60 * 1000,
  });
};
